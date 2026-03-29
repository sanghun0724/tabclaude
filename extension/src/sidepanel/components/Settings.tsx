import { useState, useEffect } from "react";
import { useT } from "@/i18n";
import { LOCALES, type Locale } from "@/i18n";
import { getSettings, saveSettings } from "@/lib/storage";
import type { Settings as SettingsType } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

export function Settings() {
  const { locale, setLocale, t } = useT();
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [newPattern, setNewPattern] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<SettingsType>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await saveSettings(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addPattern = () => {
    const pattern = newPattern.trim();
    if (!pattern || settings.excludePatterns.includes(pattern)) return;
    update({ excludePatterns: [...settings.excludePatterns, pattern] });
    setNewPattern("");
  };

  const removePattern = (pattern: string) => {
    update({
      excludePatterns: settings.excludePatterns.filter((p) => p !== pattern),
    });
  };

  const handleConnect = () => {
    console.log("[Tabclaude] Reconnect clicked");
    chrome.runtime.sendMessage({ type: "CONNECT_HOST" }, (response) => {
      console.log("[Tabclaude] CONNECT_HOST response:", response);
      if (chrome.runtime.lastError) {
        console.error("[Tabclaude] lastError:", chrome.runtime.lastError);
      }
      if (response?.connected) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
  };

  return (
    <div className="space-y-6">
      {saved && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">
          {t("settings.saved")}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-stone-400">{t("settings.language")}</h3>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
        >
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <Section title={t("settings.autonomyLevel")}>
        <p className="mb-2 text-[12px] text-stone-500">
          {t("settings.autonomyHint")}
        </p>
        {(["conservative", "balanced", "aggressive"] as const).map((level) => {
          const selected = settings.autonomyLevel === level;
          return (
            <label
              key={level}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                selected ? "bg-rose-50 ring-1 ring-rose-200" : "hover:bg-stone-50"
              }`}
            >
              <input
                type="radio"
                name="autonomy"
                checked={selected}
                onChange={() => update({ autonomyLevel: level })}
                className="sr-only"
              />
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
                selected ? "border-rose-500 bg-rose-500" : "border-stone-300"
              }`}>
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <div>
                <span className="text-sm font-medium text-stone-800">{t(`settings.${level}`)}</span>
                <span className="block text-[12px] text-stone-400">{t(`settings.${level}Desc`)}</span>
              </div>
            </label>
          );
        })}
      </Section>

      <Section title={t("settings.tabThreshold")}>
        <p className="mb-2 text-[12px] text-stone-500">
          {t("settings.tabThresholdHint")}
        </p>
        <input
          type="range"
          min={5}
          max={100}
          value={settings.tabThreshold}
          onChange={(e) =>
            update({ tabThreshold: parseInt(e.target.value, 10) })
          }
          className="w-full"
        />
        <p className="text-center text-sm font-medium text-stone-700">
          {t("settings.tabThresholdValue", { count: settings.tabThreshold })}
        </p>
      </Section>

      <Section title={t("settings.inactiveTimer")}>
        <p className="mb-2 text-[12px] text-stone-500">
          {t("settings.inactiveTimerHint")}
        </p>
        <select
          value={settings.inactiveMinutes}
          onChange={(e) =>
            update({ inactiveMinutes: parseInt(e.target.value, 10) })
          }
          className="w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
        >
          <option value={15}>{t("settings.minutes15")}</option>
          <option value={30}>{t("settings.minutes30")}</option>
          <option value={60}>{t("settings.hour1")}</option>
          <option value={120}>{t("settings.hours2")}</option>
          <option value={480}>{t("settings.hours8")}</option>
          <option value={1440}>{t("settings.hours24")}</option>
        </select>
      </Section>

      <Section title={t("settings.autoGroup")}>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-50">
          <input
            type="checkbox"
            checked={settings.autoGroupEnabled}
            onChange={(e) => update({ autoGroupEnabled: e.target.checked })}
            className="sr-only"
          />
          <span className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors ${
            settings.autoGroupEnabled ? "border-rose-500 bg-rose-500" : "border-stone-300"
          }`}>
            {settings.autoGroupEnabled && (
              <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className="text-sm font-medium text-stone-700">
            {t("settings.autoGroupLabel")}
          </span>
        </label>
      </Section>

      <Section title={t("settings.privacy")}>
        <p className="mb-2 text-[12px] text-stone-500">
          {t("settings.privacyHint")}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder={t("settings.addPatternPlaceholder")}
            className="flex-1 rounded border border-stone-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-colors"
            onKeyDown={(e) => e.key === "Enter" && addPattern()}
          />
          <button
            onClick={addPattern}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-stone-800 transition-colors"
          >
            {t("settings.add")}
          </button>
        </div>
        {settings.excludePatterns.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {settings.excludePatterns.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-1 text-[12px] text-stone-600"
              >
                {p}
                <button
                  onClick={() => removePattern(p)}
                  className="text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("settings.claudeConnection")}>
        <button
          onClick={handleConnect}
          className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:border-rose-300 hover:text-rose-600 transition-all"
        >
          {t("settings.reconnect")}
        </button>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-stone-400">
        {title}
      </h3>
      <div className="rounded-lg border border-stone-200 bg-white p-3">
        {children}
      </div>
    </div>
  );
}
