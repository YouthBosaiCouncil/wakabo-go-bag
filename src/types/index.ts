// 共通の型定義
export type NotificationType = { type: 'success' | 'error'; message: string } | null;

export type SessionType = 'lesson' | 'workshop';

// アイテムデータの新しい構造
export interface ItemData {
  id?: string;             // 一意のID（管理用）
  name: string;
  icon?: string;           // Lucide React アイコン名
  category?: string;       // カテゴリ（食料、医療用品など）
  description?: string;    // 説明文
}

export interface ItemList {
  id: string;
  name: string;
  items: (string | ItemData)[];  // 後方互換性のため両方サポート
  isDefault?: boolean;
  createdAt?: FirestoreTimestamp | Date | null;
  updatedAt?: FirestoreTimestamp | Date | null;
}

// Firestore Timestamp型
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

export interface Session {
  id: string;
  name: string;
  type: SessionType;
  itemListId: string;
  accessCode?: string;
  isActive: boolean;
  createdAt: FirestoreTimestamp | Date | null;
}

export interface SessionInfo {
  type: SessionType;
  sessionId: string;
  teamNumber?: number;
  itemList: ItemList;
  sessionName: string;
  sessionCollection?: string; // デフォルト: 'trainingSessions'
}

export interface TeamResult {
  id: string;
  teamNumber: number;
  isSubmitted: boolean;
  selectedItems?: string[];
  submittedAt?: FirestoreTimestamp | Date | null;
}

export interface ParticipantResult {
  id: string;
  userId: string | null;
  isSubmitted: boolean;
  selectedItems?: string[];
  submittedAt?: FirestoreTimestamp | Date | null;
}

export interface SessionStats {
  submittedCount: number;
  totalCount: number;
}

export interface AccessCode {
  id: string;
  code: string;
  type: 'team' | 'common';
  number?: number;
}

// チーム情報
export interface TeamData {
  id: string;
  teamNumber: number;
  accessCode: string;
  selectedItems: string[];
  isSubmitted: boolean;
  createdAt?: FirestoreTimestamp | Date | null;
  submittedAt?: FirestoreTimestamp | Date | null;
}

// 参加者情報（workshop用）
export interface ParticipantInfo {
  type: 'lesson' | 'workshop';
  team?: TeamData;
  session: { id: string; name?: string };
  itemList: { name: string; items: (string | ItemData)[] };
}
