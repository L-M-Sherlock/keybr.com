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

export function BalanceKanaProp(): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  return (
    <>
      <FieldList>
        <Field>
          <CheckBox
            label={formatMessage({
              id: "settings.balanceKana.label",
              defaultMessage: "Balance kana frequency",
            })}
            checked={settings.get(lessonProps.japanese.balanceKana)}
            onChange={(value) => {
              updateSettings(
                settings.set(lessonProps.japanese.balanceKana, value),
              );
            }}
          />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="settings.balanceKana.description"
            defaultMessage="Make unlocked kana appear regularly even when the current focus makes some kana rare in generated words."
          />
        </Description>
      </Explainer>
    </>
  );
}
