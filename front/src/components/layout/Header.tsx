import Button from "@/components/common/Button";

type Props = {
  displayName: string;
  onLogout: () => void;
};

export default function Header({
  displayName,
  onLogout,
}: Props) {
  return (
    <header className="flex items-center justify-between bg-slate-800 p-4 text-white">
      <div className="font-semibold">
        ari-docs
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm">
          {displayName}
        </span>

        <Button onClick={onLogout}>
          ログアウト
        </Button>
      </div>
    </header>
  );
}
