export type FeverGuidanceKind = 'NONE' | 'CALL_7119' | 'CALL_8000';

export type FeverGuidance = {
  isFever: boolean;
  threshold: number; // 37.5
  kind: FeverGuidanceKind;
  title: string;
  message: string;
};

export function getFeverGuidance(args: {
  tempC: number;
  ageYears?: number; // 任意。未入力でも動く
}): FeverGuidance {
  const threshold = 37.5;
  const isFever = args.tempC >= threshold;

  if (!isFever) {
    return {
      isFever: false,
      threshold,
      kind: 'NONE',
      title: '',
      message: '',
    };
  }

  // 年齢で過剰に分岐しない（要件：過剰NG）
  const age = args.ageYears;
  const kind: FeverGuidanceKind =
    typeof age === 'number' && age < 1 ? 'CALL_8000' : 'CALL_7119';

  return {
    isFever: true,
    threshold,
    kind,
    title: '高熱が記録されました',
    message:
      kind === 'CALL_8000'
        ? '小児救急相談（#8000）に相談してください。'
        : '救急安心センター（#7119）に相談してください。',
  };
}