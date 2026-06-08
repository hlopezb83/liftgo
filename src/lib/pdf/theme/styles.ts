import { StyleSheet } from "@react-pdf/renderer";
import { COLORS, FONT_SIZES, PAGE_MARGIN, ACCENT_BAR_HEIGHT } from "./tokens";

/**
 * Centralized stylesheet shared across all @react-pdf/renderer documents.
 * Use these tokens instead of inline styles to keep visual consistency.
 */
export const sharedStyles = StyleSheet.create({
  // ─── Page ────────────────────────────────────────
  page: {
    fontFamily: "Helvetica",
    fontSize: FONT_SIZES.md,
    color: COLORS.gray900,
    paddingTop: PAGE_MARGIN,
    paddingBottom: PAGE_MARGIN + 18, // footer area
    paddingHorizontal: PAGE_MARGIN,
  },
  pageLandscape: {
    fontFamily: "Helvetica",
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray900,
    paddingTop: PAGE_MARGIN,
    paddingBottom: PAGE_MARGIN + 18,
    paddingHorizontal: PAGE_MARGIN,
  },

  // ─── Accent bar ──────────────────────────────────
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: ACCENT_BAR_HEIGHT,
    backgroundColor: COLORS.gray900,
  },

  // ─── Header ──────────────────────────────────────
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 90, height: 36, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerKicker: {
    fontSize: FONT_SIZES.lg,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray700,
  },
  headerNumber: {
    fontSize: FONT_SIZES.xl,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray900,
    marginTop: 4,
  },
  headerMeta: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.gray500,
    marginTop: 3,
  },
  separator: {
    marginTop: 12,
    marginBottom: 12,
    height: 1,
    backgroundColor: COLORS.gray200,
  },

  // ─── Info cards (issuer / customer) ──────────────
  infoCardsRow: { flexDirection: "row", gap: 16, marginBottom: 14 },
  infoCard: { flex: 1 },
  infoLabel: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray500,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  infoName: {
    fontSize: FONT_SIZES.md,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray900,
    marginBottom: 2,
  },
  infoLine: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.gray700,
    marginTop: 1,
  },

  // ─── Table ───────────────────────────────────────
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.gray100,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.gray200,
  },
  tableHeaderText: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray700,
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.3,
    borderBottomColor: COLORS.gray200,
  },
  tableRowAlt: { backgroundColor: COLORS.gray50 },
  cellDesc: { flexGrow: 1, flexShrink: 1, paddingRight: 8 },
  cellNum: { width: 50, textAlign: "center" },
  cellMoney: { width: 70, textAlign: "right" },
  cellDiscount: { width: 50, textAlign: "right" },
  cellTotal: {
    width: 80,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray900,
  },
  cellText: { fontSize: FONT_SIZES.sm, color: COLORS.gray700 },
  cellTitle: { fontSize: FONT_SIZES.sm, fontFamily: "Helvetica-Bold", color: COLORS.gray900 },
  cellSpec: { fontSize: FONT_SIZES.xxs, color: COLORS.gray500, marginTop: 1 },

  // ─── Totals ──────────────────────────────────────
  totalsContainer: { marginTop: 14, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 220,
    paddingVertical: 3,
  },
  totalsLabel: { fontSize: FONT_SIZES.sm, color: COLORS.gray500 },
  totalsValue: { fontSize: FONT_SIZES.sm, color: COLORS.gray900 },
  totalsDivider: { height: 0.5, backgroundColor: COLORS.gray200, width: 220, marginVertical: 4 },
  totalsGrandLabel: { fontSize: FONT_SIZES.lg, fontFamily: "Helvetica-Bold", color: COLORS.gray900 },
  totalsGrandValue: { fontSize: FONT_SIZES.xl, fontFamily: "Helvetica-Bold", color: COLORS.gray900 },

  // ─── Terms / notes box ───────────────────────────
  termsBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: COLORS.gray50,
    borderRadius: 3,
  },
  termsTitle: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray700,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  termsItem: { fontSize: FONT_SIZES.xs, color: COLORS.gray500, marginTop: 2 },
  notesTitle: {
    fontSize: FONT_SIZES.xs,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray700,
    marginTop: 6,
  },
  notesBody: { fontSize: FONT_SIZES.xs, color: COLORS.gray500, marginTop: 2 },

  // ─── Footer ──────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: PAGE_MARGIN - 14,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    paddingTop: 6,
    borderTopWidth: 0.3,
    borderTopColor: COLORS.gray200,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: FONT_SIZES.xxs, color: COLORS.gray400 },

  // ─── Badges ──────────────────────────────────────
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    fontSize: FONT_SIZES.xxs,
    fontFamily: "Helvetica-Bold",
  },

  // ─── Generic text helpers ────────────────────────
  bold: { fontFamily: "Helvetica-Bold" },
  textCenter: { textAlign: "center" },
  textRight: { textAlign: "right" },
  small: { fontSize: FONT_SIZES.xs },
});

// ─── Contract-specific styles ─────────────────────────
// Centralized contract/annex styles so ContractDocument and its sub-pages
// (ContractBody, ChecklistAnnex, PagareAnnex) consume tokens via StyleSheet
// instead of inline literals.
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

