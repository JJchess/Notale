"use client";
import {useI18n} from '../i18n/react';

import {PropertyAnimation} from './property-animation';
import { NumberField } from "./ui/number-field";
import { editorActions, editorSession } from "../state/editor-session";
import { useEditorSelector } from "../state/use-editor-selector";
export function GeometryFields() {
 const t=useI18n();

  const source = useEditorSelector((state) => state.geometryFields),
    proportional = useEditorSelector((state) => state.proportional);
  return (
    <div className="field-grid geometry-fields">
      {(
        [
          ["tx", "X"],
          ["ty", "Y"],
          ["object-width", "宽度"],
          ["object-height", "高度"],
          ["rotation", "旋转"],
          ["scale", "缩放倍数"],
        ] as const
      ).map(([field, label]) => (
        <NumberField
          key={(source?.key ?? "empty") + field}
          id={field}
          after={<PropertyAnimation property={({tx:'translate',ty:'translate','object-width':'width','object-height':'height',rotation:'rotate',scale:'scale'})[field]}/> }
          label={t(label)}
          value={source?.values[field]}
          disabled={!source?.editable}
          min={
            field === "object-width" ||
            field === "object-height" ||
            field === "scale"
              ? 0.01
              : undefined
          }
          step={field === "scale" ? 0.01 : 1}
          onCommit={(value) =>
            source &&
            editorActions.editGeometry({
              source,
              field,
              value,
              proportional: editorSession.getSnapshot().proportional,
            })
          }
          onError={editorActions.reportError}
        />
      ))}
      <label style={{ gridColumn: "1 / -1" }}>
        <input
          id="geometry-proportional"
          type="checkbox"
          checked={proportional}
          onChange={(event) =>
            editorSession.update({ proportional: event.target.checked })
          }
        />{" "}{t("锁定宽高比")}</label>
    </div>
  );
}
export function TextReflowControl() {
 const t=useI18n();

  const checked = useEditorSelector((state) => state.textReflow);
  return (
    <label>
      <input
        id="text-reflow"
        type="checkbox"
        checked={checked}
        onChange={(event) => editorActions.setTextReflow(event.target.checked)}
      />{" "}{t("文字框调整尺寸时保持字号")}</label>
  );
}
