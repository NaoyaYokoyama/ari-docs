export enum FolderStatus {
  Working = "working",
  Review = "review",
  Completed = "completed",
  Hold = "hold",
}

export const FolderStatusInfo = {
  [FolderStatus.Working]: {
    label: "作業中",
    color: "text-green-600",
  },
  [FolderStatus.Review]: {
    label: "レビュー中",
    color: "text-yellow-600",
  },
  [FolderStatus.Completed]: {
    label: "完了",
    color: "text-blue-600",
  },
  [FolderStatus.Hold]: {
    label: "保留",
    color: "text-red-600",
  },
};
