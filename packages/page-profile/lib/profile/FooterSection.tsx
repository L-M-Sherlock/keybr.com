import { useResults } from "@keybr/result";
import {
  resultFromJson,
  type ResultJson,
  resultToJson,
} from "@keybr/result-io";
import { openResultStorage } from "@keybr/result-loader";
import { Settings, useSettings } from "@keybr/settings";
import { useTheme } from "@keybr/themes";
import { Button, Field, FieldList, Icon } from "@keybr/widget";
import { mdiDeleteForever, mdiDownload, mdiUpload } from "@mdi/js";
import { useIntl } from "react-intl";

const KEYBR_STATIC =
  process.env.KEYBR_STATIC === "1" || process.env.KEYBR_STATIC === "true";

export function FooterSection() {
  const { formatMessage } = useIntl();
  const {
    handleDownloadData,
    handleImportData,
    handleResetData,
    handleResetLocalData,
  } = useCommands();

  return (
    <FieldList>
      <Field>
        <Button
          size={16}
          icon={<Icon shape={mdiDownload} />}
          label={
            KEYBR_STATIC
              ? formatMessage({
                  id: "t_Export_data",
                  defaultMessage: "Export data",
                })
              : formatMessage({
                  id: "t_Download_data",
                  defaultMessage: "Download data",
                })
          }
          title={
            KEYBR_STATIC
              ? formatMessage({
                  id: "static.data.export.description",
                  defaultMessage:
                    "Export your local data (typing history, settings, and theme) as a JSON file.",
                })
              : formatMessage({
                  id: "profile.download.description",
                  defaultMessage:
                    "Download all your typing data in JSON format.",
                })
          }
          onClick={() => {
            handleDownloadData();
          }}
        />
      </Field>
      {KEYBR_STATIC && (
        <Field>
          <Button
            size={16}
            icon={<Icon shape={mdiUpload} />}
            label={formatMessage({
              id: "t_Import_data",
              defaultMessage: "Import data",
            })}
            title={formatMessage({
              id: "static.data.import.description",
              defaultMessage:
                "Import local data from a JSON file (overwrites your current local data).",
            })}
            onClick={() => {
              handleImportData();
            }}
          />
        </Field>
      )}
      <Field.Filler />
      <Field>
        <Button
          size={16}
          icon={<Icon shape={mdiDeleteForever} />}
          label={formatMessage({
            id: "t_Reset_statistics",
            defaultMessage: "Reset statistics",
          })}
          title={formatMessage({
            id: "profile.reset.description",
            defaultMessage:
              "Permanently delete all of your typing data and reset statistics.",
          })}
          onClick={() => {
            handleResetData();
          }}
        />
      </Field>
      {KEYBR_STATIC && (
        <Field>
          <Button
            size={16}
            icon={<Icon shape={mdiDeleteForever} />}
            label={formatMessage({
              id: "static.data.reset",
              defaultMessage: "Reset local data",
            })}
            title={formatMessage({
              id: "static.data.reset.description",
              defaultMessage:
                "Delete your local data (typing history, settings, and theme) and reset to defaults.",
            })}
            onClick={() => {
              handleResetLocalData();
            }}
          />
        </Field>
      )}
    </FieldList>
  );
}

function useCommands() {
  const { formatMessage } = useIntl();
  const { results, clearResults } = useResults();
  const { settings, updateSettings } = useSettings();
  const theme = useTheme();

  return {
    handleDownloadData: () => {
      if (KEYBR_STATIC) {
        const bundle: LocalDataBundleV1 = {
          version: 1,
          exportedAt: new Date().toISOString(),
          results: results.map(resultToJson),
          settings: settings.toJSON(),
          preferences: readPreferences(),
          theme: {
            color: theme.color,
            font: theme.font,
            custom: readCustomThemeStorage(),
          },
        };
        const json = JSON.stringify(bundle);
        const blob = new Blob([json], { type: "application/json" });
        download(blob, "kanabr-local-data.json");
      } else {
        const json = JSON.stringify(results);
        const blob = new Blob([json], { type: "application/json" });
        download(blob, "typing-data.json");
      }
    },
    handleImportData: () => {
      selectFile((file) => {
        void (async () => {
          let bundle: LocalDataBundleV1;
          try {
            bundle = parseBundle(await file.text());
          } catch (err: any) {
            console.error(err);
            window.alert(err?.message ?? String(err));
            return;
          }

          const message = formatMessage({
            id: "static.data.import.confirm",
            defaultMessage:
              "Importing will overwrite your current local data. Continue?",
          });
          if (!window.confirm(message)) {
            return;
          }

          // Theme first (it may affect UI immediately).
          if (bundle.theme?.custom != null) {
            for (const [key, value] of Object.entries(bundle.theme.custom)) {
              try {
                localStorage.setItem(key, value);
              } catch {
                /* Ignore. */
              }
            }
          }
          if (bundle.theme?.color) {
            theme.switchColor(bundle.theme.color);
          }
          if (bundle.theme?.font) {
            theme.switchFont(bundle.theme.font);
          }

          // Preferences next.
          if (bundle.preferences != null) {
            for (const [key, value] of Object.entries(bundle.preferences)) {
              try {
                localStorage.setItem(key, JSON.stringify(value));
              } catch {
                /* Ignore. */
              }
            }
          }

          // Settings (persist + update live UI).
          if (bundle.settings != null) {
            try {
              updateSettings(new Settings(bundle.settings));
            } catch (err) {
              console.error(err);
            }
          }

          // Results (persist), then reload to pick up fresh provider state.
          const importedResults = (bundle.results ?? [])
            .map((json) => resultFromJson(json as any))
            .filter((r): r is NonNullable<typeof r> => r != null);

          const storage = openResultStorage({
            type: "private",
            userId: null,
          });
          await storage.clear();
          if (importedResults.length > 0) {
            await storage.append(importedResults);
          }

          window.alert(
            formatMessage({
              id: "static.data.import.done",
              defaultMessage: "Import completed. Reloading…",
            }),
          );
          window.location.reload();
        })();
      });
    },
    handleResetData: () => {
      const message = formatMessage({
        id: "profile.reset.message",
        defaultMessage:
          "Are you sure you want to delete all data and reset your profile? " +
          "This operation is permanent and cannot be undone!",
      });
      if (window.confirm(message)) {
        clearResults();
      }
    },
    handleResetLocalData: () => {
      const message = formatMessage({
        id: "static.data.reset.confirm",
        defaultMessage:
          "Are you sure you want to delete ALL local data and reset to defaults? " +
          "This operation is permanent and cannot be undone!",
      });
      if (!window.confirm(message)) {
        return;
      }
      void (async () => {
        clearResults();
        updateSettings(new Settings());

        for (const key of PREFERENCE_KEYS) {
          try {
            localStorage.removeItem(key);
          } catch {
            /* Ignore. */
          }
        }
        for (const key of Object.keys(readCustomThemeStorage())) {
          try {
            localStorage.removeItem(key);
          } catch {
            /* Ignore. */
          }
        }
        try {
          document.cookie = `prefs=; Max-Age=0; Path=/`;
        } catch {
          /* Ignore. */
        }
        theme.switchColor("default");
        theme.switchFont("default");

        const storage = openResultStorage({
          type: "private",
          userId: null,
        });
        await storage.clear();

        window.location.reload();
      })();
    },
  };
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.setAttribute("href", URL.createObjectURL(blob));
  a.setAttribute("download", name);
  a.setAttribute("hidden", "");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type LocalDataBundleV1 = {
  readonly version: 1;
  readonly exportedAt?: string;
  readonly results?: readonly ResultJson[];
  readonly settings?: Record<string, unknown>;
  readonly preferences?: Record<string, unknown>;
  readonly theme?: {
    readonly color?: string;
    readonly font?: string;
    readonly custom?: Record<string, string>;
  };
};

const PREFERENCE_KEYS = [
  "prefs.practice.view",
  "prefs.profile.explain",
  "prefs.settings.explain",
] as const;

function readPreferences(): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const key of PREFERENCE_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null) {
      try {
        out[key] = JSON.parse(value);
      } catch {
        // Ignore invalid values.
      }
    }
  }
  return out;
}

function readCustomThemeStorage(): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key != null && key.startsWith("keybr.theme[")) {
      const value = localStorage.getItem(key);
      if (value != null) {
        out[key] = value;
      }
    }
  }
  return out;
}

function selectFile(onFile: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      onFile(file);
    }
  });
  input.click();
}

function parseBundle(text: string): LocalDataBundleV1 {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Invalid JSON file: ${err?.message ?? String(err)}`);
  }
  if (Array.isArray(json)) {
    // Legacy typing-data.json (array of Result.toJSON()).
    return {
      version: 1,
      results: json
        .map((v) => legacyResultToResultJson(v))
        .filter((v) => v != null),
    };
  }
  if (json?.version !== 1) {
    throw new Error("Unsupported data file version (expected v1 bundle)");
  }
  return json as LocalDataBundleV1;
}

function legacyResultToResultJson(value: any): ResultJson | null {
  const { layout, textType, timeStamp, length, time, errors, histogram } =
    Object(value);

  if (
    typeof layout !== "string" ||
    typeof textType !== "string" ||
    !Number.isFinite(length) ||
    !Number.isFinite(time) ||
    !Number.isFinite(errors) ||
    !Array.isArray(histogram)
  ) {
    return null;
  }

  const ts =
    typeof timeStamp === "number" ? timeStamp : Date.parse(String(timeStamp));
  if (!Number.isFinite(ts)) {
    return null;
  }

  const h: Record<number, { h: number; m: number; t: number }> =
    Object.create(null);

  for (const sample of histogram) {
    const { codePoint, hitCount, missCount, timeToType } = Object(sample);
    if (
      !Number.isSafeInteger(codePoint) ||
      !Number.isFinite(hitCount) ||
      !Number.isFinite(missCount) ||
      !Number.isFinite(timeToType)
    ) {
      return null;
    }
    h[codePoint] = {
      h: hitCount,
      m: missCount,
      t: timeToType,
    };
  }

  return {
    l: layout,
    m: textType,
    ts,
    n: Math.trunc(length),
    t: Math.trunc(time),
    e: Math.trunc(errors),
    h,
  };
}
