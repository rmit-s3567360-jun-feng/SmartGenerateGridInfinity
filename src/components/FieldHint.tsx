interface FieldHintProps {
  text: string
}

export function FieldHint({ text }: FieldHintProps) {
  return (
    <span
      aria-label={text}
      className="field-hint"
      data-tooltip={text}
      role="note"
      tabIndex={0}
      title={text}
    >
      ?
    </span>
  )
}
