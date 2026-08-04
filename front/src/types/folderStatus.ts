export enum FolderStatus {
  Working = "working",
  Review = "review",
  Completed = "completed",
  Hold = "hold",
}

export const FolderStatusInfo: Record<
  FolderStatus,
  {
    label: string;
    color: string;
  }
> = {
  [FolderStatus.Working]: {
    label: "作業中",
    color: "bg-green-100 text-green-700",
  },
  [FolderStatus.Review]: {
    label: "レビュー中",
    color: "bg-yellow-100 text-yellow-700",
  },
  [FolderStatus.Completed]: {
    label: "完了",
    color: "bg-blue-100 text-blue-700",
  },
  [FolderStatus.Hold]: {
    label: "保留",
    color: "bg-red-100 text-red-700",
  },
};
