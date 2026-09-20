import { Queue } from "bullmq";
import "dotenv/config";

const connection = { url: process.env.REDIS_URL! };

export const reviewQueue = new Queue("pr-review", { connection });