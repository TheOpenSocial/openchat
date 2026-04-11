-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "reply_to_message_id" UUID;

-- CreateTable
CREATE TABLE "chat_message_reactions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_reply_to_message_id_idx" ON "chat_messages"("reply_to_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_message_reactions_message_id_user_id_emoji_key" ON "chat_message_reactions"("message_id", "user_id", "emoji");

-- CreateIndex
CREATE INDEX "chat_message_reactions_message_id_created_at_idx" ON "chat_message_reactions"("message_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
