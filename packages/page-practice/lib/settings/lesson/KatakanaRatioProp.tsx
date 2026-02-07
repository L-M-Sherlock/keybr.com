import { lessonProps } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import { Description, Explainer, Field, FieldList, Range } from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

export function KatakanaRatioProp(): ReactNode {
  const { settings, updateSettings } = useSettings();
  const value = Math.round(
    settings.get(lessonProps.japanese.katakanaRatio) * 100,
  );
  return (
    <>
      <FieldList>
        <Field>
          <FormattedMessage
            id="t_Katakana_ratio:"
            defaultMessage="Katakana ratio:"
          />
        </Field>
        <Field>
          <Range
            size={16}
            min={0}
            max={100}
            step={5}
            value={value}
            onChange={(next) => {
              updateSettings(
                settings.set(lessonProps.japanese.katakanaRatio, next / 100),
              );
            }}
          />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="settings.katakanaRatio.description"
            defaultMessage="Mix katakana into guided lessons for Japanese. A higher value shows more katakana words."
          />
        </Description>
      </Explainer>
    </>
  );
}
