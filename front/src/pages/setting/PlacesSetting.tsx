import { ArrowDown, ArrowUp, Laptop, Plus, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import { useApp } from "@/app/AppContext";
import { useDesktop } from "@/app/DesktopContext";
import { DEFAULT_LOCAL_NAME, PLACE_COLOR_CLASS, PLACE_COLORS } from "@/app/places";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import { errorMessage } from "@/lib/format";
import { SettingPanel } from "@/pages/setting/SettingPanel";
import { checkServer } from "@/pages/setup/serverCheck";
import type { PlaceColor, PlacesConfig, ServerPlace } from "@/types/setup";

const MAX_SERVERS = 5;
const MAX_NAME = 20;

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, "");

// 場所（自分の PC と共有サーバー。FN0002-BR20）。名前・色・並び・起動したときの場所を変える。
// 保存しても再起動しない（ヘッダーの場所・Alt+0 で切り替える）。デスクトップアプリだけ
export default function PlacesSetting() {
  const desktop = useDesktop();
  const { showMessage, showConfirm } = useApp();
  const saved = desktop?.status.places;
  const [draft, setDraft] = useState<PlacesConfig | null>(saved ?? null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("http://");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!desktop || !draft || !saved) {
    return null;
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const full = draft.servers.length >= MAX_SERVERS;

  const updateServer = (index: number, patch: Partial<ServerPlace>) =>
    setDraft({
      ...draft,
      servers: draft.servers.map((server, i) => (i === index ? { ...server, ...patch } : server)),
    });

  const moveServer = (index: number, step: number) => {
    const servers = [...draft.servers];
    const [server] = servers.splice(index, 1);
    servers.splice(index + step, 0, server);
    setDraft({ ...draft, servers });
  };

  const removeServer = (index: number) => {
    const url = draft.servers[index].url;
    setDraft({
      ...draft,
      servers: draft.servers.filter((_, i) => i !== index),
      // 起動したときの場所に選んでいたら、前回の場所に戻す
      startPlace: draft.startPlace === url ? "last" : draft.startPlace,
    });
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = normalizeUrl(newUrl);
    const name = newName.trim() || "共有サーバー";
    if (draft.servers.some((server) => server.url === url)) {
      showMessage("error", "その共有サーバーはもう登録しています");
      return;
    }
    setAdding(true);
    try {
      await checkServer(url);
    } catch (error) {
      const proceed = await showConfirm(`${errorMessage(error, "接続できません")}。このまま追加しますか？`);
      if (!proceed) {
        setAdding(false);
        return;
      }
    }
    setDraft({ ...draft, servers: [...draft.servers, { name, url, color: "" }] });
    setNewName("");
    setNewUrl("http://");
    setAdding(false);
  };

  const save = async () => {
    const servers = draft.servers.map((server) => ({ ...server, name: server.name.trim(), url: normalizeUrl(server.url) }));
    const places: PlacesConfig = {
      ...draft,
      localName: draft.localName.trim(),
      servers,
      // URL を変えて起動したときの場所が無くなったら、前回の場所に戻す
      startPlace: ["last", "local", ...servers.map((server) => server.url)].includes(draft.startPlace)
        ? draft.startPlace
        : "last",
    };
    setSaving(true);
    try {
      // URL を変えた共有サーバーは、つながるかを確かめる（つながらなくても、確認したうえで保存できる）
      for (const server of places.servers) {
        if (saved.servers.some((item) => item.url === server.url)) {
          continue;
        }
        try {
          await checkServer(server.url);
        } catch (error) {
          const proceed = await showConfirm(
            `${server.name}（${server.url}）: ${errorMessage(error, "接続できません")}。このまま保存しますか？`,
          );
          if (!proceed) {
            return;
          }
        }
      }
      await desktop.savePlaces(places);
      setDraft(places);
      const removedCurrent = !desktop.place.local && !places.servers.some((server) => server.url === desktop.place.id);
      showMessage(
        "info",
        removedCurrent
          ? "場所を保存しました。今の共有サーバーは一覧から外れたので、ほかの場所に切り替えてください"
          : "場所を保存しました",
      );
    } catch (error) {
      showMessage("error", errorMessage(error, "場所の保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingPanel
      title="場所"
      description="自分の PC と共有サーバーを登録しておき、ヘッダーの場所（Alt+0）で再起動せずに切り替えます。ファイル・Note・Wiki・ログインは場所ごとに別で、切り替えるとホームを開き直します。自分の PC はいつも使えます。"
      plain
    >
      {!desktop.status.canChangePlaces ? (
        <p className="text-sm text-muted-foreground">設定ファイルに書き込めないため、場所を変えられません。</p>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Laptop size={16} className="text-muted-foreground" />
              自分の PC
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={draft.localName}
                onChange={(e) => setDraft({ ...draft, localName: e.target.value })}
                placeholder={DEFAULT_LOCAL_NAME}
                maxLength={MAX_NAME}
                aria-label="自分の PC の名前"
                className="w-56"
              />
              <ColorPicker
                value={draft.localColor}
                onChange={(color) => setDraft({ ...draft, localColor: color })}
                label="自分の PC の色"
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Server size={16} className="text-muted-foreground" />
              共有サーバー（{draft.servers.length} / {MAX_SERVERS}）
            </h2>
            {draft.servers.length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">登録した共有サーバーはありません</p>
            ) : (
              <ul className="mb-4 divide-y divide-border">
                {draft.servers.map((server, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2 py-2.5">
                    <Input
                      value={server.name}
                      onChange={(e) => updateServer(index, { name: e.target.value })}
                      maxLength={MAX_NAME}
                      aria-label="名前"
                      className="w-40"
                    />
                    <Input
                      value={server.url}
                      onChange={(e) => updateServer(index, { url: e.target.value })}
                      aria-label="URL"
                      className="min-w-48 flex-1 font-mono text-[0.8125rem]"
                    />
                    <ColorPicker
                      value={server.color}
                      onChange={(color) => updateServer(index, { color })}
                      label={`${server.name} の色`}
                    />
                    <div className="flex">
                      <IconButton label="上へ" disabled={index === 0} onClick={() => moveServer(index, -1)}>
                        <ArrowUp size={16} />
                      </IconButton>
                      <IconButton
                        label="下へ"
                        disabled={index === draft.servers.length - 1}
                        onClick={() => moveServer(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </IconButton>
                      <IconButton label="削除" onClick={() => removeServer(index)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {full ? (
              <p className="text-sm text-muted-foreground">共有サーバーは {MAX_SERVERS} つまで登録できます</p>
            ) : (
              <form onSubmit={add} className="flex flex-wrap gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="名前（例: 開発部）"
                  maxLength={MAX_NAME}
                  aria-label="追加する共有サーバーの名前"
                  className="w-40"
                />
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="例: http://ari-server:8080"
                  aria-label="追加する共有サーバーの URL"
                  className="min-w-48 flex-1 font-mono text-[0.8125rem]"
                />
                <Button type="submit" variant="secondary" disabled={adding || normalizeUrl(newUrl).length <= "http://".length}>
                  <Plus size={16} />
                  {adding ? "確認中..." : "追加"}
                </Button>
              </form>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <label htmlFor="start-place" className="mb-1 block text-sm font-semibold">
              起動したときの場所
            </label>
            <p className="mb-3 text-xs text-muted-foreground">アプリを起動したときに開く場所です</p>
            <select
              id="start-place"
              value={draft.startPlace}
              onChange={(e) => setDraft({ ...draft, startPlace: e.target.value })}
              className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              <option value="last">前回の場所</option>
              <option value="local">{draft.localName.trim() || DEFAULT_LOCAL_NAME}</option>
              {draft.servers.map((server) => (
                <option key={server.url} value={normalizeUrl(server.url)}>
                  {server.name}
                </option>
              ))}
            </select>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={!changed || saving} onClick={() => setDraft(saved)}>
              元に戻す
            </Button>
            <Button disabled={!changed || saving} onClick={() => void save()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </>
      )}
    </SettingPanel>
  );
}

function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: PlaceColor;
  onChange: (color: PlaceColor) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {PLACE_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          role="radio"
          aria-checked={value === color.value}
          aria-label={color.label}
          title={color.label}
          onClick={() => onChange(color.value)}
          className={twMerge(
            "flex size-6 items-center justify-center rounded-full border-2 transition-colors",
            value === color.value ? "border-foreground" : "border-transparent hover:border-border",
          )}
        >
          <span className={twMerge("size-3.5 rounded-full", PLACE_COLOR_CLASS[color.value])} />
        </button>
      ))}
    </div>
  );
}
