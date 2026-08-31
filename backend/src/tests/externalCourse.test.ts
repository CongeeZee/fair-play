import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createVerifiedTestUser, prisma } from "./setup";

vi.mock("../lib/email", () => ({ sendVerificationEmail: vi.fn() }));

vi.mock("../middleware/rateLimiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/rateLimiter")>();
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, passthrough]));
});

vi.stubGlobal("fetch", vi.fn());

const { default: app } = await import("../app");

process.env.GOLF_API_KEY = process.env.GOLF_API_KEY || "test-golf-api-key";

/**
 * Modelled on the real payload for Avondale Golf Club (`fvarq8qc`), which is
 * the course that surfaced the bug: it lists a White tee for men and another
 * for women, off different rating plates. Same name, different course.
 */
const AVONDALE = {
  id: "fvarq8qc",
  course_name: "Avondale Golf Club",
  club_name: "Avondale Golf Club",
  tees: {
    male: [
      { tee_name: "White", course_rating: 70.5, slope_rating: 126, holes: Array(18).fill({ par: 4, yardage: 350 }) },
      { tee_name: "Blue", course_rating: 71.5, slope_rating: 132, holes: Array(18).fill({ par: 4, yardage: 370 }) },
    ],
    female: [
      // Par 5s, so a wrong resolution shows up in the hole data as well as the rating.
      { tee_name: "White", course_rating: 76.4, slope_rating: 132, holes: Array(18).fill({ par: 5, yardage: 340 }) },
      { tee_name: "Red", course_rating: 73.7, slope_rating: 126, holes: Array(18).fill({ par: 5, yardage: 320 }) },
    ],
  },
};

function mockCourseFetch() {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ course: AVONDALE }),
  } as Response);
}

async function startRound(
  token: string,
  body: { externalCourseId: string; teeName: string; teeGender?: "male" | "female" },
) {
  const res = await request(app)
    .post("/rounds")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  expect(res.status).toBe(201);
  return res.body;
}

describe("importing an external course by tee", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    mockCourseFetch();
  });

  /**
   * The reported bug. A club that lists the same colour for men and women gave
   * two options that resolved to the same tee: `find` matched on the name
   * alone and always returned the men's set, so choosing the women's White
   * silently produced a round on the men's course — a 5.9-stroke difference in
   * course rating, which feeds straight into the Score Differential.
   */
  it("resolves the requested gender's tee, not whichever came first", async () => {
    const user = await createVerifiedTestUser();

    const mens = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc",
      teeName: "White",
      teeGender: "male",
    });
    const womens = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc",
      teeName: "White",
      teeGender: "female",
    });

    expect(mens.course.courseRating).toBe(70.5);
    expect(mens.course.slopeRating).toBe(126);
    expect(womens.course.courseRating).toBe(76.4);
    expect(womens.course.slopeRating).toBe(132);
  });

  it("stores the two same-named tees as separate courses", async () => {
    const user = await createVerifiedTestUser();

    const mens = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "White", teeGender: "male",
    });
    const womens = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "White", teeGender: "female",
    });

    expect(mens.course.id).not.toBe(womens.course.id);
    expect(await prisma.course.count()).toBe(2);

    // The hole data must follow the tee too, not just the rating.
    const mensHoles = await prisma.hole.findMany({ where: { courseId: mens.course.id } });
    const womensHoles = await prisma.hole.findMany({ where: { courseId: womens.course.id } });
    expect(mensHoles.every((h) => h.par === 4)).toBe(true);
    expect(womensHoles.every((h) => h.par === 5)).toBe(true);
  });

  /**
   * Appending the gender to every key would have been simpler, but it would
   * have orphaned every course already imported and split players' round
   * histories across two rows. The tee the old code resolved to keeps the key
   * it had; only the one it could never reach gets a new one.
   */
  it("keeps the legacy key for the tee the old resolution would have picked", async () => {
    const user = await createVerifiedTestUser();

    await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "White", teeGender: "male",
    });
    await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "White", teeGender: "female",
    });
    // "Red" exists only for women, so the old code would have resolved it there.
    await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "Red", teeGender: "female",
    });

    const ids = (await prisma.course.findMany({ select: { externalId: true } }))
      .map((c) => c.externalId)
      .sort();

    expect(ids).toEqual(["fvarq8qc_Red", "fvarq8qc_White", "fvarq8qc_White_female"]);
  });

  it("names women's tee sets so they can be told from the men's", async () => {
    const user = await createVerifiedTestUser();

    const mens = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "White", teeGender: "male",
    });
    const womens = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "White", teeGender: "female",
    });
    const blue = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "Blue", teeGender: "male",
    });

    // Women's tees always carry the qualifier — it reads as useful, and it is
    // what lets the cache lookup tell a legacy-keyed row's gender. Men's tees
    // stay unqualified, which is the name they have always had.
    expect(mens.course.name).toBe("Avondale Golf Club — White Tees");
    expect(womens.course.name).toBe("Avondale Golf Club — White Tees (Women's)");
    expect(blue.course.name).toBe("Avondale Golf Club — Blue Tees");
  });

  it("re-uses the existing course instead of importing twice", async () => {
    const user = await createVerifiedTestUser();

    const first = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "Blue", teeGender: "male",
    });
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length;

    const second = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "Blue", teeGender: "male",
    });

    expect(second.course.id).toBe(first.course.id);
    // Second round is served from the DB without touching the external API.
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsAfterFirst);
  });

  it("still works for a client that sends no gender", async () => {
    const user = await createVerifiedTestUser();

    const round = await startRound(user.accessToken, {
      externalCourseId: "fvarq8qc", teeName: "White",
    });

    // Falls back to the historical first-match behaviour: the men's set.
    expect(round.course.courseRating).toBe(70.5);
    expect(round.course.externalId).toBe("fvarq8qc_White");
  });
});
