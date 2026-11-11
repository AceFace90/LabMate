# Keeping the web (TypeScript) and iOS (Swift) copies in sync

Import parsing, the marker catalog, range logic and duplicate handling exist twice. A change
to one must be made in the other, or imports and ranges will behave differently per platform.

| Web (`src/`) | iOS (`LabMate App/LabMate/LabMate/`) |
| --- | --- |
| `lib/anchoredParser.ts` | `Parser/AnchoredParser.swift` |
| `lib/pdfParser.ts` | `Parser/LabReportParser.swift` |
| `lib/textLines.ts` | `Parser/TextLines.swift` |
| `lib/dates.ts` | `Logic/Dates.swift` |
| `data/markerCatalog.ts` | `Logic/MarkerCatalog.swift` (aliases, ranges, `direction`) |
| `lib/storage.ts` (`sameValue`, `classifyImport`, `mergeResults`) | `Logic/ResultMerge.swift` |
| `lib/healthScore.ts` (`effectiveRange`, `showLabFlag`) | `Logic/HealthScore.swift` |
| `lib/vo2Norms.ts` | `vo2P10` in `Logic/HealthScore.swift` |
| `components/UploadFlow.tsx` | `Views/Import/ImportView.swift` |

When changing one side, change the other in the same commit and re-run a sample report through both.
