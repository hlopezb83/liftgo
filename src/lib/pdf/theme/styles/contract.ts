import { StyleSheet } from "@react-pdf/renderer";
import { COLORS, FONT_SIZES } from "../tokens";

/**
 * Contract/annex-specific styles consumed by ContractDocument and its sub-pages
 * (ContractBody, ChecklistAnnex, PagareAnnex). Kept separate from sharedStyles
 * because the contract pack has its own visual language (typography, spacing,
 * signature boxes, checklists, pagaré).
 */
export const contractStyles = StyleSheet.create({
  headerCompanyName: {
    fontSize: FONT_SIZES.sm,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray900,
  },
  headerCompanyMeta: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.gray500,
  },
  headerNumber: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray500,
  },
  docTitle: {
    fontSize: FONT_SIZES.xl,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  docSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.gray500,
    textAlign: "center",
    marginBottom: 12,
  },
  intro: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray900,
    marginTop: 10,
    marginBottom: 6,
  },
  subsectionTitle: {
    fontSize: FONT_SIZES.md,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  bullet: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
    marginLeft: 12,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  declarationLabel: {
    fontSize: FONT_SIZES.sm,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  clauseBlock: { marginBottom: 6 },
  clauseTitle: {
    fontSize: FONT_SIZES.sm,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  clauseBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
    lineHeight: 1.4,
  },
  closingLine: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
    marginTop: 20,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
  },
  signatureCol: { width: "45%" },
  signatureBox: {
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray900,
    paddingTop: 4,
  },
  signatureLabel: {
    fontSize: FONT_SIZES.xs,
    fontFamily: "Helvetica-Bold",
  },
  signatureName: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.gray700,
  },
  // Checklist
  infoLineRow: { flexDirection: "row", marginBottom: 3 },
  infoLineLabel: {
    fontSize: FONT_SIZES.sm,
    fontFamily: "Helvetica-Bold",
    width: 140,
  },
  infoLineValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
  },
  checkbox: {
    width: 7,
    height: 7,
    borderWidth: 0.5,
    borderColor: COLORS.gray700,
    marginHorizontal: 3,
  },
  checklistItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
    justifyContent: "space-between",
  },
  checklistItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  checklistItemText: { fontSize: FONT_SIZES.sm, marginLeft: 4 },
  checklistItemRight: { flexDirection: "row", alignItems: "center" },
  checklistKey: { fontSize: FONT_SIZES.xs },
  checklistSection: { marginTop: 8 },
  checklistFooterCol: {
    width: "45%",
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray900,
    paddingTop: 4,
  },
  // Pagaré
  pagareFieldRow: { flexDirection: "row", marginBottom: 3 },
  pagareFieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontFamily: "Helvetica-Bold",
    width: 90,
  },
  pagareFieldValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
  },
  pagareHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pagareBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
    lineHeight: 1.5,
  },
  pagareSubsection: {
    fontSize: FONT_SIZES.md,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 6,
  },
  pagareLine: { fontSize: FONT_SIZES.sm, marginBottom: 3 },
  pagareLineSpaced: { fontSize: FONT_SIZES.sm, marginBottom: 12 },
  pagareSignatureBox: {
    width: "50%",
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray900,
    paddingTop: 4,
  },
});
