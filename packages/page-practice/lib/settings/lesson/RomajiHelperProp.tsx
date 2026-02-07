import { lessonProps } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import {
  CheckBox,
  Description,
  Explainer,
  Field,
  FieldList,
} from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

export function RomajiHelperProp(): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  return (
    <>
      <FieldList>
        <Field>
          <CheckBox
            label={formatMessage({
              id: "settings.romajiHelper.label",
              defaultMessage: "Show romaji helper",
            })}
            checked={settings.get(lessonProps.japanese.showRomajiHelper)}
            onChange={(value) => {
              updateSettings(
                settings.set(lessonProps.japanese.showRomajiHelper, value),
              );
            }}
          />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="settings.romajiHelper.description"
            defaultMessage="Show a helper bar with your current romaji composition and suggested spellings for the next kana."
          />
        </Description>
      </Explainer>
    </>
  );
}

