export type TaskStatus = 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'REVIEW_PENDING' | 'REWORK' | 'DECLINED' | 'DONE';
export type TaskSourceType = 'channel' | 'dm';
export type TaskCompletionReason = 'APPROVED' | 'NO_REVIEW' | 'REVIEW_TIMEOUT';

export interface CreateTaskRequest {
  workspaceId: string;
  sourceMessageId: string;
  title: string;
  assigneeId: string;
  dueDate: string; // UTC ISO timestamp.
  reviewRequired: boolean;
  reviewWorkingDays?: number | null;
  estimatedMinutes?: number | null;
}

export type TaskRequestAction = 'accept' | 'decline' | 'proposeDueDate' | 'approveDueDate' | 'rejectDueDate';

export interface RespondToTaskRequest {
  taskId: string;
  action: TaskRequestAction;
  proposedDueDate?: string;
}

export interface TaskRecord<TimestampValue> {
  workspaceId: string;
  sourceMessageId: string;
  sourceType: TaskSourceType;
  title: string;
  requesterId: string;
  assigneeId: string;
  dueDate: TimestampValue;
  proposedDueDate: TimestampValue | null;
  estimatedMinutes: number | null;
  status: TaskStatus;
  reviewRequired: boolean;
  reviewWorkingDays: number | null;
  reviewCycle: number;
  reviewDeadlineAt: TimestampValue | null;
  completionReason: TaskCompletionReason | null;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}
