/*
  Warnings:

  - You are about to drop the column `createdBy` on the `Room` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,teamId]` on the table `TeamMembership` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Room" DROP COLUMN "createdBy";

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_userId_teamId_key" ON "TeamMembership"("userId", "teamId");
