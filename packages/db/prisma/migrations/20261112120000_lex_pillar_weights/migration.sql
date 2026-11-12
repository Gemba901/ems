-- AlterTable
ALTER TABLE "LexStrategicDirection" ADD COLUMN "pillarWeights" JSONB NOT NULL DEFAULT '{"LEX":10,"PEX":20,"OPX":30,"CMX":20,"SGEX":10,"FPEX":10}';
