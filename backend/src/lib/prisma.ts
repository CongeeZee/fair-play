import { PrismaClient } from "@prisma/client";

// Singleton — prevents connection pool exhaustion during hot reload in dev
const prisma = new PrismaClient();

export default prisma;
