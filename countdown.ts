import { jsx, type Style, type UiElement } from 'modlock'

// Text-only overlay: avoid thin translucent panels and blurred text effects.
export function countdown(round: number, remaining: number | undefined, phrase: string): UiElement {
  const label = (text: string, style: Style) => jsx('label', {
    children: text,
    style: { width: '100%', horizontalAlign: 'center', textAlign: 'center', face: 'block',
      color: '#ffefd7', shadow: false, ...style },
  })
  return jsx('panel', {
    style: { horizontalAlign: 'center', verticalAlign: 'center', width: 440, flow: 'down' },
    children: [
      label('BEBOP / HOOK ARENA', {
        fontSize: 16, letterSpacing: 1, bold: true, color: '#bfb3a1', margin: [0, 0, 14, 0],
      }),
      label(`ROUND ${String(round).padStart(2, '0')}`, {
        fontSize: 24, bold: true, margin: [8, 0, 0, 0],
      }),
      label(remaining === undefined ? 'GET READY' : String(remaining), {
        fontSize: remaining === undefined ? 48 : 164, bold: true, face: 'block',
        color: remaining === 1 ? '#fd736d' : '#ffefd7',
        margin: [0, 0, 0, 0],
      }),
      label(phrase, { fontSize: 18, bold: true, color: '#bfb3a1', margin: [16, 0, 0, 0] }),
    ],
  })
}
