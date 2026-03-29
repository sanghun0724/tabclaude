import { useState, useEffect } from "react";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n";
import type { TabSummary } from "@/lib/types";

interface Props {
  summary: TabSummary | null;
  onRefresh: () => void;
  isAnalyzing?: boolean;
  onAnalyze?: () => void;
}

const catColors: Record<string, string> = {
  Development: "bg-blue-500",
  Search: "bg-violet-500",
  Social: "bg-pink-500",
  Video: "bg-red-500",
  Shopping: "bg-emerald-500",
  News: "bg-amber-500",
  Docs: "bg-cyan-500",
  AI: "bg-rose-500",
  Other: "bg-stone-400",
};

export function Dashboard({ summary, onRefresh, isAnalyzing, onAnalyze }: Props) {
  const { locale, t } = useT();
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "GET_SESSIONS", limit: 1000 },
      (response) => {
        if (response?.ok) setSessionCount(response.sessions.length);
      },
    );
  }, [summary]);

  const handleQuickSave = () => {
    chrome.runtime.sendMessage({ type: "SAVE_ALL_TABS" }, () => {
      onRefresh();
      chrome.runtime.sendMessage(
        { type: "GET_SESSIONS", limit: 1000 },
        (response) => {
          if (response?.ok) setSessionCount(response.sessions.length);
        },
      );
    });
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-stone-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500" />
        {t("dashboard.loading")}
      </div>
    );
  }

  const windowCount = Object.keys(summary.byWindow).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">{t("dashboard.overview")}</h2>
        <button
          onClick={onRefresh}
          className="text-[12px] font-medium text-stone-400 hover:text-stone-600 transition-colors"
        >
          {t("dashboard.refresh")}
        </button>
      </div>

      <div className="space-y-1.5">
        <StatCard label={t("dashboard.openTabs")} value={summary.total} />
        <StatCard label={t("dashboard.savedSessions")} value={sessionCount} />
        <StatCard label={t("dashboard.windows")} value={windowCount} />
        <StatCard label={t("dashboard.inactive")} value={summary.inactive.length} warn />
      </div>

      <button
        onClick={handleQuickSave}
        className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-stone-800 active:scale-[0.98]"
      >
        {t("dashboard.quickSave")}
      </button>

      {summary.duplicates.length > 0 && (
        <div className="border-l-2 border-l-amber-500 bg-amber-50/50 rounded-md p-3">
          <p className="text-xs font-medium text-amber-800">
            {t("dashboard.duplicates", { count: summary.duplicates.length })}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">
          {t("dashboard.categories")}
        </h3>
        {summary.categories.map((cat) => (
          <CategoryRow
            key={cat.name}
            name={t(`category.${cat.name}` as MessageKey)}
            colorKey={cat.name}
            count={cat.count}
            total={summary.total}
          />
        ))}
      </div>

      {summary.inactive.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">
            {t("dashboard.inactiveTabs")}
          </h3>
          <div className="max-h-48 divide-y divide-stone-100 overflow-y-auto">
            {summary.inactive.slice(0, 10).map((tab) => (
              <InactiveTabRow key={tab.id} tab={tab} locale={locale} />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onAnalyze}
        disabled={isAnalyzing}
        className={`w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
          isAnalyzing
            ? "bg-stone-50 text-stone-400 cursor-not-allowed border-stone-200"
            : "border-stone-200 bg-white text-stone-700 hover:border-rose-300 hover:text-rose-600"
        }`}
      >
        {isAnalyzing && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500" />
        )}
        {isAnalyzing ? "Analyzing..." : t("dashboard.askClaude")}
      </button>
    </div>
  );
}

function InactiveTabRow({ tab, locale }: { tab: { id?: number; title?: string; url: string; favIconUrl?: string; lastAccessed: number }; locale: string }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50">
      {tab.favIconUrl && !imgError ? (
        <img
          src={tab.favIconUrl}
          alt=""
          className="h-3 w-3 shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-stone-200 text-[9px] font-bold text-stone-500">
          {(tab.title || tab.url).charAt(0).toUpperCase()}
        </div>
      )}
      <span className="truncate">{tab.title || tab.url}</span>
      <span className="ml-auto text-stone-400 shrink-0">
        {formatTimeAgo(tab.lastAccessed, locale)}
      </span>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between rounded-md bg-stone-50 px-3 py-2.5">
      <span className="text-[12px] font-medium text-stone-500">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${
        warn && value > 0 ? "text-amber-600" : "text-stone-800"
      }`}>
        {value}
      </span>
    </div>
  );
}

function CategoryRow({
  name,
  colorKey,
  count,
  total,
}: {
  name: string;
  colorKey: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor = catColors[colorKey] ?? "bg-stone-400";
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs text-stone-600 truncate">{name}</span>
      <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-stone-500 w-8 text-right">{count}</span>
    </div>
  );
}

function formatTimeAgo(timestamp: number, locale: string): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" });

  if (seconds < 60) return rtf.format(-seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.floor(hours / 24), "day");
}
