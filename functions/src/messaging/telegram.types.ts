/**
 * Telegram Bot API Types
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: { user: TelegramUser; status: string };
  new_chat_member: { user: TelegramUser; status: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  my_chat_member?: TelegramChatMemberUpdated;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
}

/**
 * Firestore Types for Telegram Integration
 */

export interface TelegramToUser {
  userId: string;
  linkedAt: FirebaseFirestore.Timestamp;
  telegramUsername?: string;
  telegramFirstName: string;
  telegramChatId: number;
}

export interface TelegramLinkToken {
  odacitytelegramId: string;
  telegramChatId: number;
  telegramFirstName: string;
  telegramUsername?: string;
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  used: boolean;
}

export interface MessagingPreferences {
  telegramEnabled: boolean;
  dailyCheckInEnabled: boolean;
  checkInTime: string; // "08:00" format
  missionLogReminderEnabled: boolean;
  reminderTime: string; // "20:00" format
}

/**
 * Extended ChatMessage with source tracking
 */
export interface ChatMessageWithSource {
  role: "user" | "model";
  content: string;
  createdAt: FirebaseFirestore.Timestamp;
  source: "web" | "telegram";
}
