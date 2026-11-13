export type TaskStatus = 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'REVIEW_PENDING' | 'REWORK' | 'DECLINED' | 'DONE';
export type TaskSourceType = 'channel' | 'dm';
export type TaskCompletionReason = 'APPROVED' | 'NO_REVIEW' | 'REVIEW_TIMEOUT';

export interface CreateTaskRequest {
  workspaceId: string;
  sourceMessageId: string;
  title: string;
  description?: string | null;
  assigneeId: string;
  dueDate: string; // UTC ISO timestamp.
  reviewRequired: boolean;
  reviewWorkingDays?: number | null;
  estimatedMinutes?: number | null;
}

export type TaskRequestAction = 'accept' | 'decline' | 'startProgress' | 'proposeDueDate' | 'approveDueDate' | 'rejectDueDate' | 'submitForReview' | 'complete' | 'approveReview' | 'rejectReview' | 'resubmitForReview';

export interface RespondToTaskRequest {
  taskId: string;
  action: TaskRequestAction;
  proposedDueDate?: string;
  rejectionReason?: string;
}

export interface TaskEventRecord<TimestampValue> {
  taskId: string;
  actorId: string;
  action: TaskRequestAction;
  createdAt: TimestampValue;
  metadata: {
    previousDueDate?: string;
    proposedDueDate?: string;
    dueDate?: string;
    reviewCycle?: number;
    reviewWorkingDays?: number;
    rejectionReason?: string;
    completionReason?: TaskCompletionReason;
  };
}

export interface TaskRecord<TimestampValue> {
  workspaceId: string;
  sourceMessageId: string;
  sourceType: TaskSourceType;
  title: string;
  description?: string | null;
  requesterId: string;
  assigneeId: string;
  dueDate: TimestampValue;
  proposedDueDate: TimestampValue | null;
  estimatedMinutes: number | null;
  status: TaskStatus;
  reviewRequired: boolean;
  reviewWorkingDays: number | null;
  reviewCycle: number;
  reviewSubmittedAt?: TimestampValue | null;
  reviewRejectionReason?: string | null;
  reviewDeadlineAt: TimestampValue | null;
  completionReason: TaskCompletionReason | null;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}
