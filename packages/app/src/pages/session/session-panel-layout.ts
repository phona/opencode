export function sessionPanelLayout(input: { review: boolean; terminal: boolean; files: boolean; questions: boolean }) {
  return {
    visible: input.review || input.terminal || input.files || input.questions,
    stacked: input.review && input.terminal,
  }
}
