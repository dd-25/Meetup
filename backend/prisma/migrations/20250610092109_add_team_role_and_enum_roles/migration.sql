/*
  Warnings:

  - The `role` column on the `OrganizationMembership` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('leader', 'member');

-- AlterTable
ALTER TABLE "OrganizationMembership" DROP COLUMN "role",
ADD COLUMN     "role" "OrganizationRole" NOT NULL DEFAULT 'member';

-- AlterTable
ALTER TABLE "TeamMembership" ADD COLUMN     "role" "TeamRole" NOT NULL DEFAULT 'member';
