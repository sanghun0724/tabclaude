import { useT } from "@/i18n";
import type { Suggestion } from "@/lib/types";

interface Props {
  suggestion: Suggestion;
  onApplied: () => void;
}

export function SuggestionCard({ suggestion, onApplied }: Props) {
  const { t } = useT();

  const handleApply = () => {
    chrome.runtime.sendMessage(
      { type: "APPLY_SUGGESTION", suggestion },
      () => {
        onApplied();
      },
    );
  };

  const riskStyles = {
    low: "border-l-2 border-l-emerald-500 bg-white border border-stone-200",
    high: "border-l-2 border-l-red-500 bg-red-50/30 border border-red-200/50",
  };

  const typeIcons = {
    close: "×",
    group: "▤",
    restore: "↺",
  };

  return (
    <div className={`rounded-lg ${riskStyles[suggestion.risk]} p-3`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeIcons[suggestion.type]}</span>
          <div>
            <p className="text-sm font-medium text-stone-900">
              {suggestion.title}
            </p>
            <p className="text-xs text-stone-500">{suggestion.description}</p>
          </div>
        </div>
        <button
          onClick={handleApply}
          className={`rounded px-3 py-1 text-xs font-medium text-white transition-colors ${
            suggestion.risk === "high"
              ? "bg-red-500 hover:bg-red-600"
              : "bg-emerald-500 hover:bg-emerald-600"
          }`}
        >
          {suggestion.risk === "high" ? t("suggestion.approve") : t("suggestion.apply")}
        </button>
      </div>

      {suggestion.tabs.length > 0 && (
        <div className="mt-2 space-y-1">
          {suggestion.tabs.slice(0, 5).map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-1 text-xs text-stone-600"
            >
              {tab.favIconUrl && (
                <img
                  src={tab.favIconUrl}
                  alt=""
                  className="h-3 w-3"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <span className="truncate">{tab.title || tab.url}</span>
            </div>
          ))}
          {suggestion.tabs.length > 5 && (
            <p className="text-xs text-stone-400">
              {t("suggestion.more", { count: suggestion.tabs.length - 5 })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
