index.html loads three stylesheets in a strict cascade—/styles/main.css (lines 15), /styles/app.css (line 16), and /styles/redesign.css (line 17)—where each subsequent file partially overrides the layout engine and color palette of the previous one without cleaning up inherited properties. Because :root in main.css defines light-mode surface and typography tokens (--bg-main: #F6F3EE, --bg-surface: #FFFFFF, --text-primary: #101318), while redesign.css introduces dark-mode sections (.landing-shell) and converts dark banners (.welcome-card, .landing-plan-card) to light backgrounds without re-scoping child text colors, the UI suffers from severe black-on-black (#101318 on #090A0C) and white-on-white (#FFFFFF / #F6F3EE on #FFFFFF / #F6F3EE) contrast failures.   1. Design Token & CSS Variable Audit (main.css, app.css, redesign.css)1.1 Core Token Comparison & Cascade Bypassmain.css establishes the CSS custom property system in :root (lines 4–184), app.css consumes those tokens, and redesign.css mixes token usage with hardcoded hex/RGBA literals that bypass the token system.   Token Namemain.css Definition (Lines 4–184)app.css Usageredesign.css Usage / Override Conflict--bg-main#F6F3EE (lines 10, 66, 121)   .app-loading, .auth-shell (lines 269, 300)   Used on body (line 13), .app-shell (line 67), .landing-final (line 2235), .landing-footer (line 2295); hardcoded as #F6F3EE in .app-navbar (line 261), .workspace (line 322), .auth-panel (line 1451)   --bg-surface#FFFFFF (lines 11, 67, 122)   Cards, modals, inputs, .icon-btn   Overridden with hardcoded #FFFFFF in .card, .toolbar-card, .kpi-card... (line 295), .table-wrap (line 623), .form-control (line 662), .auth-form (line 1479); used in .landing-plan-card (line 2056)   --bg-subtle#F7F4EE (lines 12, 68, 123)   .detail-item, .snapshot-card, .workout-chip   Overridden in .snapshot-card (line 884), .builder-stats (line 951), .workout-chip (line 1011), .exercise-media (line 1088), .archive-card (line 1239) with hardcoded #FBFAF7   --bg-accent-soft#F5F3EE (lines 13, 69, 124)   Active/hover states (.icon-btn:hover, .badge-info, .trainee-list-item.active)   Abandoned in redesign.css workspace rules in favor of --berry-subtle (#F9EFF3), creating a pink/coral clash; still used on .landing-visual-icon (line 1697) and .landing-day.today (line 2104)   --text-primary#101318 (lines 14, 70, 125)   Primary text, .badge-dark, .toast-success   Used un-scoped inside dark .landing-shell on .landing-visual-title strong (line 1720), .landing-feature h3 (line 1953), and .landing-experience-points strong (line 2221), causing black text on dark #090A0C backgrounds   --text-secondary#4F5560 (lines 15, 71, 126)   Subtitles, .card-header p, .welcome-card p   Bypassed with rgba(16, 19, 24, 0.72) in .card-header p (line 310); used un-scoped in dark .landing-feature p (line 1965) and .landing-experience-copy (lines 2191, 2228), causing 2.55:1 low-contrast dark gray on black   --text-muted#6B7078 (lines 16, 72, 127)   Meta labels, timestamps, .user-email   Used un-scoped in dark .landing-visual-title span (line 1712) and .landing-feature-index (line 1945)   --mutedUndefined   Used in .remember-row (app.css line 444)   Evaluates to invalid/inherited until overridden by redesign.css line 759 (color: var(--text-secondary))   --primary#E85C4A (Coral Ember, lines 17, 73, 128)   Buttons, links, active states, progress bars   Hardcoded as linear-gradient(90deg, #E85C4A, #D94A4A) on .app-nav .nav-btn.active (line 299), .welcome-card .btn-primary (line 376), .btn-primary (line 489), .auth-submit (line 1502)   --secondary / --secondary-soft#101318 / #F5F3EE (lines 20–21)   Rest days (.day-card.rest-day, .rest-icon), .proof-guide, .toast-info   Because --secondary is near-black (#101318), .proof-guide (app.css line 719) gets a stark black border and .rest-icon (app.css line 635) gets black text inside a champagne rest card   --berry / --berry-subtle / --dusty-rose#7A1C3E / #F9EFF3 / #C88A9E (lines 41–44)   Unused in app.css   Heavily used across redesign.css for hover/active backgrounds (.kpi-icon, .icon-btn:hover, .badge-info, .form-control:focus, .theme-option.active, .avatar), clashing with --primary (#E85C4A)   --champagne / --champagne-bg#B9A06C / #FBF7EB (lines 45–46)   Unused in app.css   Used on .day-card.rest-day (background: var(--champagne-bg)) with .rest-day-body > span (color: var(--champagne)), producing a 2.38:1 contrast failure   --banner-gradientlinear-gradient(135deg, #090A0C 0%, #101318 100%) (line 34)   .welcome-card (line 143), .auth-brand-panel (line 306)   Overridden by hardcoded gradients in redesign.css (lines 326, 1361), rendering --banner-gradient unused in the final cascade   1.2 Broken Theme Switcher Tokens ([data-theme="v1"], [data-theme="v2"], [data-theme="v3"])Identical Token Blocks (main.css lines 4–169)::root, [data-theme="v1"] (lines 4–59), [data-theme="v2"] (lines 61–114), and [data-theme="v3"] (lines 116–169) define the exact same hex values for every color variable (--bg-main: #F6F3EE, --primary: #E85C4A, --text-primary: #101318, etc.).   [data-theme="v1"] and [data-theme="v3"] are 100% identical down to shadow values, while [data-theme="v2"] differs only by 2px in shadow blur (38px vs 40px on lines 80–81, 111).   Mismatch with UI Swatches (app.js lines 888–904):   renderThemePicker() in app.js renders three theme cards with distinct preview swatches (v1: #D94A4A, #090A0C, #F4F1EA; v2: #D94A4A, #171A1E, #F6F5F2; v3: #D94A4A, #090A0C, #F4F1EA), and redesign.css hardcodes #F6F3EE, #FFFFFF, #E85C4A, and #101318 on .workspace, .card, .app-navbar, and .btn-primary (lines 261, 295, 322, 489). Consequently, switching themes in Settings has zero visual effect on the UI.   1.3 Unused CSS Variables in main.cssThe following tokens defined in main.css are never referenced by any selector in main.css, app.css, or redesign.css:   --bg-ink (#090A0C, lines 6, 62, 117)   --bg-carbon (#101318, lines 7, 63, 118)   --bg-bone (#F6F3EE, lines 8, 64, 119)   --bg-paper (#FFFFFF, lines 9, 65, 120)   --border-subtle (rgba(255, 255, 255, 0.08), lines 24, 80, 135)   --berry-hover (#5E142F, lines 42, 98, 153)   --accent-gold (#B9A06C, lines 49, 105, 160)   --accent-success (#22C55E, lines 50, 106, 161)   2. View-by-View Contrast & Color Conflict Audit2.1 Landing View (.landing-shell — Dark Mode)app.js renders the landing page inside <div class="landing-shell" id="top"> (app.js lines 530–713). redesign.css sets .landing-shell to a dark theme (background: radial-gradient(circle at top, rgba(232, 92, 74, 0.12), transparent 38%), #090A0C; color: #F6F3EE; at lines 1455–1458), but fails to override the light-mode :root tokens inside .landing-shell.   Critical Contrast Failures in .landing-shellComponent / Selectorredesign.css Line RefsComputed ForegroundComputed BackgroundContrast RatioVisual Bug Description.landing-visual-title strongLines 1719–1724   var(--text-primary) (#101318)   rgba(255,255,255,0.08) over #090A0C (~#1A1B1E)   1.07 : 1 (Fail)Dark on Dark: Hero card title ("Weekly rhythm") is near-black on a dark glass card—completely invisible.   .landing-visual-title spanLines 1711–1717   var(--text-muted) (#6B7078)   ~#1A1B1E   3.35 : 1 (Fail)Dark on Dark: Kicker ("THIS WEEK") at 0.58rem (9.3px) falls below WCAG AA 4.5:1.   .landing-feature h3Lines 1951–1957   var(--text-primary) (#101318)   rgba(255,255,255,0.06) over #090A0C (~#141518)   1.02 : 1 (Fail)Dark on Dark: All three #method card headings ("Programming with intention", etc.) are black on black.   .landing-feature pLines 1963–1968   var(--text-secondary) (#4F5560)   #090A0C to #141518   2.55 : 1 (Fail)Dark on Dark: Body copy inside all three #method feature cards is dark slate on black.   .landing-feature-indexLines 1941–1949   var(--text-muted) (#6B7078)   #141518   3.61 : 1 (Fail)Dark on Dark: 01, 02, 03 badges at 0.6rem fail contrast on dark cards.   .landing-session > div strongLines 2160–2162   #F6F3EE (Bone White)   .landing-plan-card var(--bg-surface) (#FFFFFF)   1.08 : 1 (Fail)Light on Light: .landing-plan-card is pure white (#FFFFFF, line 2056), but .landing-session > div strong is bone white (#F6F3EE)—workout titles are invisible.   .landing-session > div spanLines 2164–2166   rgba(246, 243, 238, 0.6)   .landing-plan-card (#FFFFFF)   1.04 : 1 (Fail)Light on Light: Session meta ("Done", "Today · 45 min") is semi-transparent white on a white card.   .landing-session-iconLines 2141–2150   #F6F3EE   rgba(255, 255, 255, 0.1) on #FFFFFF   1.08 : 1 (Fail)Light on Light: Check/dumbbell icons and their container box are white on white.   .landing-session (border)Lines 2124–2130   rgba(255, 255, 255, 0.12)   #FFFFFF   1.00 : 1 (Fail)Light on Light: White border on non-active session rows is invisible against #FFFFFF.   .landing-experience-points strongLines 2219–2224   var(--text-primary) (#101318)   .landing-experience (#090A0C)   1.07 : 1 (Fail)Dark on Dark: Point titles ("Private by default", "A week you can see", "Accountability without pressure") are black on #090A0C.   .landing-experience-copy > p & .landing-experience-points pLines 2188–2194, 2226–2231   var(--text-secondary) (#4F5560)   #090A0C   2.65 : 1 (Fail)Dark on Dark: Section description and point descriptions are dark gray on #090A0C.   .landing-footer-brand strongLines 1356–1363 vs Line 2295   #F6F3EE (line 1362)   .landing-footer var(--bg-main) (#F6F3EE, line 2295)   1.00 : 1 (Fail)Light on Light: Exact same hex (#F6F3EE) for text and background—footer brand title is 100% invisible.   .landing-footer-actions .landing-lang & .landing-signinLines 1492–1510 vs Line 2295   rgba(246,243,238,0.88) / #F6F3EE   .landing-footer var(--bg-main) (#F6F3EE, line 2295)   1.00 : 1 (Fail)Light on Light: Both footer buttons use light text (#F6F3EE) and white translucent borders (rgba(255,255,255,0.14)) over a #F6F3EE background.   Additional Landing Layout & Styling DefectsMissing Desktop Padding on .landing-visual-main (redesign.css lines 1656–1666 vs line 2394):.landing-visual-main has no padding on desktop viewports (> 640px), only receiving padding: 20px inside @media (max-width: 640px) (line 2394). Meanwhile, .landing-score-row (line 1743) and .landing-score-bar (line 1762) have horizontal 28px padding/margins, while .landing-visual-top, .landing-visual-stats, and .landing-next-session have 0px outer padding and collide directly with the 1px border of .landing-visual-main.   Inverted Surface Sub-cards inside .landing-visual-main (redesign.css lines 1690–1856):Inside the dark glass .landing-visual-main, .landing-week-badge (lines 1726–1737) and .landing-visual-stats > div (lines 1785–1790) use background: var(--bg-subtle) (#F7F4EE) and border: 1px solid var(--border-color) (#E7E3DC), while .landing-next-session (lines 1809–1816) uses background: var(--text-primary) (#101318 on #090A0C), blending into the dark card bottom.   .landing-final-card Secondary CTA Hover Vanish (redesign.css lines 1506–1514, 2238–2248):.landing-final-card has background: var(--primary) (#E85C4A). Its primary button (app.js line 693) has class .btn.btn-secondary. Because .landing-shell .btn.btn-secondary:hover (line 1513) sets border-color: rgba(232, 92, 74, 0.9) (#E85C4A), hovering over the button on the #E85C4A card causes its border to vanish.   2.2 Auth View (.auth-shell — Split Dark/Light Layout)app.js renders <div class="auth-shell"> (app.js lines 785–827) with a dark .auth-brand-panel on the inline-start side and a light .auth-panel (#F6F3EE) with a white .auth-form (#FFFFFF) on the inline-end side.   Base app.css Dark-on-Dark Inheritance in .auth-brand-panel (app.css lines 303–326):   In app.css, .auth-brand-panel sets background: var(--banner-gradient) (#090A0C -> #101318, line 306) without setting a light color. .auth-brand-title, .auth-brand-copy h2, and .auth-features li (color: var(--text-secondary) = #4F5560, line 325) are dark text on a dark gradient until redesign.css (lines 1352–1424) overrides them with #F6F3EE / #FFFFFF.   Undefined --muted Token on .remember-row (app.css line 444):   app.css line 444 declares .remember-row { ... color: var(--muted); }, referencing a non-existent variable. redesign.css line 759 patches this with color: var(--text-secondary).   Mixed Accent Palette in .auth-brand-panel (redesign.css lines 1361, 1397, 1424, 1432):   The panel background uses coral radial glow rgba(232, 92, 74, 0.18) (line 1361), .auth-orbit uses mauve var(--dusty-rose) (#C88A9E, line 1432), .auth-features .icon uses gold var(--champagne) (#B9A06C, line 1424), and .auth-brand-copy .eyebrow overrides --primary with muted gray rgba(246, 243, 238, 0.6) (line 1397).   .auth-message.info Berry Mismatch (redesign.css lines 1538–1542):   Uses border-color: #EBCAD7; background: var(--berry-subtle); (#F9EFF3 pink) instead of neutral/coral surface tokens.   2.3 Workspace View (.app-shell — Light Mode with Dark Topbar & Hero)app.js renders <div class="app-shell"> (app.js lines 402–450) containing <header class="app-topbar"> (dark #090A0C), <div class="app-navbar"> (light #F6F3EE), and <main class="workspace"> (light #F6F3EE with #FFFFFF cards).   Critical Contrast Failures in WorkspaceComponent / SelectorFile & Line RefsComputed ForegroundComputed BackgroundContrast RatioVisual Bug Description.welcome-card h2redesign.css lines 318–330 vs 342–347   #FFFFFF (line 344)   linear-gradient(120deg, #FFFFFF 0%, #F6F3EE 100%) (line 326)   1.00 : 1 to 1.08 : 1 (Fail)Light on Light: redesign.css changed .welcome-card from dark --banner-gradient (app.css line 143) to a white/bone gradient (line 326), but left .welcome-card h2 { color: #FFFFFF; } (line 344). The main dashboard heading for Admin, Coach, and Trainee is completely invisible.   .welcome-card predesign.css lines 349–353   rgba(255, 255, 255, 0.72)   #FFFFFF / #F6F3EE (line 326)   1.03 : 1 (Fail)Light on Light: Dashboard welcome subtitle is semi-transparent white on a white/bone card—completely invisible.   .welcome-card .eyebrowredesign.css lines 355–357   var(--dusty-rose) (#C88A9E)   #FFFFFF / #F6F3EE   2.68 : 1 (Fail)Light on Light: Pastel dusty rose eyebrow fails WCAG AA contrast on white/bone and clashes with --primary (#E85C4A).   .welcome-card .week-progress-card & .week-progress-head strongredesign.css lines 380–393   #FFFFFF / rgba(255, 255, 255, 0.68)   rgba(255, 255, 255, 0.08) over #F6F3EE   1.03 : 1 to 1.08 : 1 (Fail)Light on Light: Trainee schedule weekly progress widget (app.js lines 956–960) has white text (#FFFFFF) and translucent white borders/tracks on the light #F6F3EE welcome card—completely invisible.   .rest-day-body > spanredesign.css lines 971–975, 990–996   var(--champagne) (#B9A06C)   var(--champagne-bg) (#FBF7EB)   2.38 : 1 (Fail)Light on Light: Coach builder rest day label ("REST DAY") uses #B9A06C gold text on #FBF7EB cream background, failing WCAG AA.   Additional Workspace Color, Token & Directionality ConflictsWidespread --berry-subtle / --dusty-rose vs --primary Coral Clash (redesign.css):In redesign.css, active/hover/badge states use --berry-subtle (#F9EFF3 cool pink) and --dusty-rose (#C88A9E mauve) while borders, text, and buttons use --primary (#E85C4A warm orange-coral):   Topbar: .role-badge (color: var(--dusty-rose), line 154), .topbar-action .icon (color: var(--dusty-rose), line 204), .user-chip .avatar (color: var(--dusty-rose), line 220), and .topbar-logout:hover (background: var(--berry); border-color: var(--berry);, line 251).   Workspace Components: .kpi-icon (line 433), .icon-btn:hover (line 552), .badge-info (line 603, with #EBCAD7 border), .form-control:focus (line 676), .theme-option:hover, .theme-option.active (line 774), .empty-icon (line 825), .avatar (line 849), .snapshot-card:hover (line 889), .trainee-list-item.active (line 929), .add-exercise-btn:hover (line 1003), .workout-mini-icon (line 1039), .standing-row.me (line 1192), .leaderboard-row.is-current-trainee (line 1231), .lock-illustration (line 1269), and .radio-card:has(input:checked) (line 1317).   .proof-guide Stark Black Border (app.css lines 715–726):   .proof-guide uses background: var(--secondary-soft); border: 1px solid var(--secondary); and .proof-guide .icon { color: var(--secondary); }. Because --secondary is #101318 (near-black) in main.css (line 20), the proof guide box inside the trainee upload modal has a harsh solid black border and black shield icon instead of an accent or subtle border.   .trainee-rest-body .rest-icon Un-updated Color (app.css line 635 vs redesign.css line 971):redesign.css changes .trainee-day-card.rest to champagne (border-color: #E6CE8A; background: var(--champagne-bg);, lines 971–975), but leaves .rest-icon from app.css line 635 (color: var(--secondary) = #101318) un-styled.   Toast Notification Semantic Color Loss (app.css lines 787–789 vs redesign.css lines 1604–1625):app.css differentiates .toast-error (var(--status-danger-text)), .toast-info (var(--secondary)), and .toast-success (var(--text-primary)). redesign.css overrides .toast and .toast-success with var(--header-bg) (#090A0C) and .toast-info with #1C1E24 (lines 1609, 1616, 1620), making success and info toasts nearly identical dark-black boxes.   LTR Arrow Direction Bug on .link-btn .icon (app.js line 977, redesign.css lines 1612–1616):icon("arrow") (<path d="M19 12H5M12 19l-7-7 7-7"/> in app.js line 251) points left (←) by default. redesign.css lines 1612–1616 rotate .landing-primary .icon, .landing-how-cta .icon, and .landing-text-link .icon by 180deg in html[dir="ltr"], but omits .link-btn .icon. In renderTraineeSchedule() (app.js line 977: ${t("viewProgressBtn")} ${icon("arrow")}), the English LTR button renders "View progress ←" pointing backward into the label.   3. Specificity, Duplicate Rules & Dead Code Inventory3.1 Duplicate & Self-Overriding Blocks Within redesign.cssEntire Landing Header & Shell Block Duplicated (redesign.css lines 1300–1453 vs lines 1455–1515):   .landing-shell, .landing-header, .landing-header-inner, .landing-brand, .landing-logo, .landing-logo img, .landing-brand-copy, .landing-brand-copy strong, .landing-brand-copy span, .landing-nav, .landing-nav a, .landing-header-actions, .landing-lang, and .landing-shell .btn are declared at lines 1300–1453 and immediately re-declared at lines 1455–1515.   Collateral Bugs from Partial Override:.landing-logo: Line 1331 sets padding: 4px; border: 1px solid var(--border-color); background: #FFFFFF;. Line 1479 overrides background with a coral/gold gradient and .landing-logo img { object-fit: cover; }, but inherits padding: 4px and the light #E7E3DC border from line 1331.   .landing-brand-copy span: Line 1365 sets font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;. Line 1495 overrides font-size: 0.78rem; without resetting text-transform: uppercase or letter-spacing: 0.08em, inflating the tagline into oversized uppercase text.   .landing-lang:hover: Line 1421 sets background: var(--bg-subtle); color: var(--text-primary);, causing the dark header's language pill to flash stark white (#F7F4EE) on hover.   Duplicate .topbar-action:hover (redesign.css lines 193–200):   Lines 193–195 set background: rgba(255, 255, 255, 0.04);, which is immediately overwritten at lines 197–200 by background: #272A33; border-color: #3A3E48;.   Duplicate .form-control:focus (redesign.css lines 669–677):   Lines 669–672 set border-color: rgba(232, 92, 74, 0.9); box-shadow: 0 0 0 4px rgba(232, 92, 74, 0.08); (coral focus ring), which is immediately overwritten at lines 674–677 by border-color: var(--primary); box-shadow: 0 0 0 3px var(--berry-subtle); (pink focus ring).   Duplicate html[lang="ar"] .landing-label (redesign.css lines 1891–1897):   Exact same rule (letter-spacing: 0;) repeated twice back-to-back.   3.2 Three-Way Layout Collisions & Dead Selectors Across main.css and app.css.app-shell Triple Definition:main.css line 214 (display: grid; grid-template-columns: 265px 1fr; min-height: calc(100vh - 52px);) -> app.css line 89 (grid-template-columns: 260px minmax(0, 1fr); min-height: 100vh;) -> redesign.css line 62 (display: flex; flex-direction: column;).   Furthermore, in @media (max-width: 1024px), both main.css (line 476) and app.css (line 811) set .app-shell { grid-template-columns: 1fr; } on an element that is now display: flex in redesign.css.   Orphaned / Unused Selectors (Never Rendered by app.js):main.css: .demo-toolbar, .demo-toolbar-group, .demo-label, .demo-pill-group, .demo-pill, .demo-select, .lang-toggle-btn (lines 197–211); .sidebar, .nav-list, .sidebar-footer, .main-area, .top-header, .header-title-area, .header-actions (lines 215–231); .grid-2, .section-header, .section-title (lines 240–242); .btn-whatsapp (lines 250–251); .filter-bar (line 264); .builder-layout, .library-panel, .draggable-exercise, .week-grid, .day-column, .scheduled-item, .exercise-thumb (lines 267–276); .hero-banner (line 277); .winner-spotlight-card, .winner-spotlight-layout, .winner-avatar-wrapper, .winner-avatar-ring, .winner-crown-badge, .winner-rank-pill, .winner-reward-banner, .winner-stats-box, .winner-stat-pill, .leaderboard-list, .leaderboard-row, .rank-circle, .you-badge, .motivation-strip, .fair-play-banner, .proof-chip (lines 290–473).   app.css: .sidebar, .sidebar-brand-row, .sidebar-user-name, .sidebar-user-email, .sidebar-logout, .brand-logout, .main-area, .top-header, .header-title-area (lines 95–123 and media queries at lines 812–828, 882–887).   4. Concrete Fixes per File & Selector (with Line References)4.1 Fixes in main.cssFix 1: Differentiate [data-theme="v1"], [data-theme="v2"], and [data-theme="v3"] and Unify Accent Tokens (main.css lines 4–169)Align the soft accent tokens with --primary (#E85C4A) so --berry-subtle and --dusty-rose no longer clash with coral, add a darker accessible champagne text token (--champagne-text: #7A5C1E — 5.74:1 contrast on #FBF7EB), and give v2 (Graphite Motion) and v3 (Carbon Motion) distinct palettes matching renderThemePicker() in app.js (lines 889–893):   CSS/* main.css — Replace lines 4–169 */
:root,
[data-theme="v1"] {
  /* Version 1: Proof in Motion (Warm Bone & Ember Coral) */
  --bg-ink: #090A0C;
  --bg-carbon: #101318;
  --bg-bone: #F6F3EE;
  --bg-paper: #FFFFFF;
  --bg-main: #F6F3EE;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F7F4EE;
  --bg-accent-soft: #FDF0ED;
  --text-primary: #101318;
  --text-secondary: #4F5560;
  --text-muted: #656A73;
  --primary: #E85C4A;
  --primary-hover: #D94A4A;
  --primary-contrast: #FFFFFF;
  --secondary: #1E242B;
  --secondary-soft: #F2EFE9;
  --border-color: #E7E3DC;
  --border-strong: #D7D1C7;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 14px;
  --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgba(9, 10, 12, 0.02), 0 20px 40px -30px rgba(9, 10, 12, 0.4);
  --shadow-hover: 0 24px 50px -28px rgba(9, 10, 12, 0.5);
  --shadow-soft: 0 40px 80px -60px rgba(0, 0, 0, 0.9);
  --font-heading-en: 'Archivo', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body-en: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-heading-ar: 'Cairo', 'IBM Plex Sans Arabic', sans-serif;
  --font-body-ar: 'IBM Plex Sans Arabic', sans-serif;
  --banner-gradient: linear-gradient(135deg, #FFFFFF 0%, #F6F3EE 100%);
  --card-border-width: 1px;
  --header-bg: #090A0C;
  --header-elevated: #101318;
  --header-border: rgba(255, 255, 255, 0.08);
  --header-text: #F6F3EE;
  --header-muted: rgba(246, 243, 238, 0.72);
  --berry: #D94A4A;
  --berry-hover: #B91C1C;
  --berry-subtle: #FDF0ED;
  --dusty-rose: #F3A69B;
  --champagne: #B9A06C;
  --champagne-text: #7A5C1E;
  --champagne-bg: #FBF7EB;
  --accent-ember: #E85C4A;
  --accent-mint: #22C55E;
  --accent-gold: #B9A06C;
  --accent-success: #22C55E;
  --winner-card-bg: linear-gradient(135deg, #FFFFFF 0%, #F7F4EE 100%);
  --winner-border: #E7E3DC;
  --winner-ring: linear-gradient(135deg, #B9A06C 0%, #E85C4A 100%);
  --winner-glow: 0 18px 40px -28px rgba(185, 160, 108, 0.4);
  --winner-badge-bg: linear-gradient(135deg, #B9A06C 0%, #8F6D0F 100%);
  --reward-banner-bg: linear-gradient(135deg, #FBF7EB 0%, #F7F4EE 100%);
}

[data-theme="v2"] {
  /* Version 2: Graphite Motion (Cool Alabaster & Slate Graphite) */
  --bg-main: #F4F5F7;
  --bg-surface: #FFFFFF;
  --bg-subtle: #ECEEF2;
  --bg-accent-soft: #FDECE9;
  --text-primary: #171A1E;
  --text-secondary: #475467;
  --text-muted: #667085;
  --primary: #D94A4A;
  --primary-hover: #B93838;
  --border-color: #DDE1E8;
  --border-strong: #C8CFD9;
  --header-bg: #171A1E;
  --header-elevated: #22262C;
  --berry-subtle: #FDECE9;
}

[data-theme="v3"] {
  /* Version 3: Carbon Motion (Warm Sand & Deep Berry-Ember) */
  --bg-main: #F3EFE6;
  --bg-surface: #FCFBF9;
  --bg-subtle: #EAE4D7;
  --bg-accent-soft: #F9E8E6;
  --text-primary: #090A0C;
  --text-secondary: #4A4843;
  --text-muted: #6E6A63;
  --primary: #C84B31;
  --primary-hover: #A83820;
  --border-color: #E2DBD0;
  --border-strong: #CFC6B8;
  --header-bg: #090A0C;
  --header-elevated: #141619;
  --berry-subtle: #F9E8E6;
}
4.2 Fixes in app.cssFix 1: Replace Undefined --muted Token in .remember-row (app.css line 444)CSS/* app.css — Line 444 */
.remember-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
  color: var(--text-secondary); /* Was: var(--muted) */
}
Fix 2: Fix .auth-brand-panel Base Contrast & .proof-guide / .rest-icon Hard --secondary (#101318) Usage (app.css lines 303–326, 635, 715–726)CSS/* app.css — Lines 303–326: Ensure base auth brand panel has readable text */
.auth-brand-panel {
  position: relative;
  overflow: hidden;
  background: var(--banner-gradient);
  color: var(--header-text);
  border-inline-end: var(--card-border-width) solid var(--border-color);
  padding: 42px 56px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 36px;
  min-height: 100vh;
}

/* app.css — Line 635: Use warm gold/champagne text token instead of black --secondary */
.rest-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--champagne-text, #7A5C1E);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* app.css — Lines 715–726: Soften .proof-guide border and icon color */
.proof-guide {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--bg-accent-soft);
  border: 1px solid rgba(232, 92, 74, 0.25);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-bottom: 16px;
}
.proof-guide .icon { color: var(--primary); margin-top: 2px; }
.proof-guide p { color: var(--text-secondary); font-size: 0.78rem; }
4.3 Fixes in redesign.cssFix 1: Remove Duplicate .topbar-action:hover (redesign.css lines 193–200)CSS/* redesign.css — Replace lines 193–200 with a single rule */
.topbar-action:hover {
  background: #272A33;
  border-color: #3A3E48;
}
Fix 2: Respect Theme Tokens on .app-navbar, .workspace, and .card (redesign.css lines 257–264, 287–300, 316–323)CSS/* redesign.css — Lines 257–264 */
.app-navbar {
  position: sticky;
  top: var(--topbar-height);
  z-index: 60;
  background: var(--bg-main); /* Was hardcoded #F6F3EE */
  border-bottom: 1px solid var(--border-color);
}

/* redesign.css — Lines 316–323 */
.workspace {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 30px 28px 80px;
  background: radial-gradient(circle at top, rgba(255, 255, 255, 0.6), transparent 60%), var(--bg-main);
}

/* redesign.css — Lines 325–336 (Card group) */
.card,
.toolbar-card,
.kpi-card,
.day-card,
.trainee-day-card,
.exercise-card,
.trainee-list-card {
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  box-shadow: 0 60px 120px -90px rgba(16, 19, 24, 0.9);
}
Fix 3: Fix Critical White-on-White Text inside .welcome-card & .week-progress-card (redesign.css lines 354–425)Because .welcome-card has a light background (linear-gradient(120deg, #FFFFFF 0%, #F6F3EE 100%)), its headings, paragraphs, eyebrow, and trainee progress sub-card must use dark/primary foreground tokens instead of #FFFFFF:   CSS/* redesign.css — Replace lines 378–425 */
.welcome-card h2 {
  margin-bottom: 7px;
  color: var(--text-primary); /* Was #FFFFFF (1.04:1 contrast!) */
  font-size: clamp(1.5rem, 2.6vw, 2.1rem);
  line-height: 1.15;
}

.welcome-card p {
  max-width: 640px;
  color: var(--text-secondary); /* Was rgba(255, 255, 255, 0.72) (1.03:1 contrast!) */
  font-size: 0.9rem;
}

.welcome-card .eyebrow {
  color: var(--primary); /* Was var(--dusty-rose) (2.68:1 contrast!) */
}

.welcome-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.welcome-card .btn-secondary {
  border-radius: 999px;
  border: 1px solid rgba(16, 19, 24, 0.18);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.welcome-card .btn-primary {
  border-radius: 999px;
  border: none;
  background: linear-gradient(90deg, var(--primary), var(--primary-hover));
  color: var(--primary-contrast);
}

.welcome-card .week-progress-card {
  min-width: 260px;
  border: 1px solid var(--border-color); /* Was rgba(255, 255, 255, 0.16) */
  background: var(--bg-surface);         /* Was rgba(255, 255, 255, 0.08) */
  color: var(--text-primary);            /* Was #FFFFFF */
  box-shadow: var(--shadow-card);
}

.welcome-card .week-progress-head,
.welcome-card .week-progress-meta {
  color: var(--text-secondary); /* Was rgba(255, 255, 255, 0.68) */
}

.welcome-card .week-progress-head strong {
  color: var(--primary); /* Was #FFFFFF */
}

.welcome-card .progress-track {
  background: var(--bg-subtle); /* Was rgba(255, 255, 255, 0.16) */
}

.welcome-card .progress-fill {
  background: var(--primary);
}
Fix 4: Deduplicate .form-control:focus and Fix .badge-info Border (redesign.css lines 601–605, 669–677)CSS/* redesign.css — Lines 601–605 */
.badge-info {
  border-color: rgba(232, 92, 74, 0.25); /* Was #EBCAD7 pink */
  background: var(--bg-accent-soft);
  color: var(--primary);
}

/* redesign.css — Replace duplicate .form-control:focus at lines 669–677 */
.form-control:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 4px rgba(232, 92, 74, 0.12);
}
Fix 5: Fix .rest-day-body > span Contrast Failure (redesign.css lines 990–996)CSS/* redesign.css — Lines 990–996 */
.rest-day-body > span {
  color: var(--champagne-text, #7A5C1E); /* Was var(--champagne) #B9A06C (2.38:1 -> now 5.74:1) */
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
Fix 6: Fix .auth-message.info and Toast Semantic Colors (redesign.css lines 1538–1542, 1615–1625)CSS/* redesign.css — Lines 1538–1542 */
.auth-message.info {
  border-color: rgba(232, 92, 74, 0.25);
  background: var(--bg-accent-soft);
  color: var(--text-primary);
}

/* redesign.css — Lines 1615–1625 */
.toast-success {
  border-color: rgba(34, 197, 94, 0.35);
  background: #11261B;
}

.toast-info {
  border-color: rgba(255, 255, 255, 0.14);
  background: #1C1E24;
}

.toast-error {
  border-color: #991B1B;
  background: #7F1D1D;
}
Fix 7: Deduplicate .landing-shell / .landing-header Block & Fix All Landing Contrast Collisions (redesign.css lines 1300–2350)Delete the first duplicate header block at redesign.css lines 1300–1453 (keeping .landing-footer-brand strong and .landing-nav a::after merged cleanly into lines 1455–1515), and fix .landing-lang:hover so it stays dark-themed:   CSS/* redesign.css — Consolidated Landing Header (replaces lines 1300–1515) */
.landing-shell {
  min-height: 100vh;
  overflow-x: clip;
  background: radial-gradient(circle at top, rgba(232, 92, 74, 0.12), transparent 38%), #090A0C;
  color: #F6F3EE;
}

.landing-header {
  position: sticky;
  top: 0;
  z-index: 90;
  background: rgba(9, 10, 12, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.landing-header-inner {
  width: 100%;
  max-width: 1180px;
  min-height: 76px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 28px;
}

.landing-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.landing-logo {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFFFFF;
}

.landing-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.landing-brand-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.landing-brand-copy strong,
.landing-footer-brand strong {
  font-family: var(--font-heading-en);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #F6F3EE;
}

html[lang="ar"] .landing-brand-copy strong,
html[lang="ar"] .landing-footer-brand strong {
  font-family: var(--font-heading-ar);
  letter-spacing: 0;
}

.landing-brand-copy span {
  font-size: 0.68rem;
  font-weight: 600;
  color: rgba(246, 243, 238, 0.7);
  white-space: nowrap;
}

.landing-nav {
  display: flex;
  align-items: center;
  gap: 24px;
}

.landing-nav a {
  position: relative;
  padding: 8px 0;
  color: rgba(246, 243, 238, 0.78);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.88rem;
  transition: color 0.2s ease;
}

.landing-nav a::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  bottom: 2px;
  height: 1px;
  background: var(--accent-ember);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 180ms ease;
}

html[dir="rtl"] .landing-nav a::after {
  transform-origin: right;
}

.landing-nav a:hover {
  color: #F6F3EE;
}

.landing-nav a:hover::after {
  transform: scaleX(1);
}

.landing-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.landing-lang {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: rgba(246, 243, 238, 0.88);
  padding: 8px 14px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.landing-lang:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.28);
  color: #FFFFFF;
}

.landing-lang .icon {
  width: 16px;
  height: 16px;
}

.landing-shell .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 44px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.landing-shell .btn .icon {
  width: 16px;
  height: 16px;
}

.landing-signin {
  min-height: 40px;
  padding-inline: 18px;
}

.landing-shell .btn.btn-secondary {
  border-color: rgba(255, 255, 255, 0.18);
  background: transparent;
  color: #F6F3EE;
}

.landing-shell .btn.btn-secondary:hover {
  border-color: rgba(232, 92, 74, 0.9);
  background: rgba(232, 92, 74, 0.08);
}
Fix .landing-visual-main Desktop Padding & Dark-on-Dark Text (redesign.css lines 1656–1856):   CSS/* redesign.css — Lines 1656–1856 */
.landing-visual-main {
  position: relative;
  z-index: 2;
  padding: 24px; /* Added missing desktop padding */
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(9, 10, 12, 0.92) 100%);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.landing-visual-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(232, 92, 74, 0.35);
  border-radius: 12px;
  background: rgba(232, 92, 74, 0.16);
  color: var(--primary);
}

.landing-visual-title span {
  color: rgba(246, 243, 238, 0.68); /* Was var(--text-muted) #6B7078 */
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.landing-visual-title strong {
  color: #F6F3EE; /* Was var(--text-primary) #101318 (1.07:1!) */
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1.25;
}

.landing-week-badge {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(246, 243, 238, 0.82);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.landing-score-row {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 18px 0 0; /* Adjusted now that .landing-visual-main has 24px padding */
}

.landing-score-bar {
  position: relative;
  margin: 14px 0 0;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.landing-visual-stats > div {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05); /* Was var(--bg-subtle) #F7F4EE */
}

.landing-visual-stats strong {
  display: block;
  color: #F6F3EE; /* Was var(--text-primary) #101318 */
  font-size: 0.94rem;
  font-weight: 800;
  line-height: 1.2;
}

.landing-visual-stats span {
  display: block;
  margin-top: 2px;
  color: rgba(246, 243, 238, 0.68); /* Was var(--text-muted) */
  font-size: 0.62rem;
  font-weight: 700;
}

.landing-next-session {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: 12px;
  padding: 13px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06); /* Distinct from #090A0C card bottom */
  color: #F6F3EE;
}
Fix .landing-feature Dark-on-Dark Headings & Copy (redesign.css lines 1941–1968):   CSS/* redesign.css — Lines 1941–1968 */
.landing-feature-index {
  position: absolute;
  top: 28px;
  inset-inline-end: 28px;
  color: rgba(246, 243, 238, 0.48); /* Was var(--text-muted) #6B7078 */
  font-family: var(--font-heading-en);
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.landing-feature h3 {
  margin: 36px 0 0;
  color: #F6F3EE; /* Was var(--text-primary) #101318 (1.02:1!) */
  font-size: 1.08rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.landing-feature p {
  margin: 10px 0 0;
  color: rgba(246, 243, 238, 0.74); /* Was var(--text-secondary) #4F5560 (2.55:1!) */
  font-size: 0.84rem;
  line-height: 1.75;
}
Fix .landing-plan-card / .landing-session White-on-White & .landing-experience Dark-on-Dark (redesign.css lines 2048–2231):
Keep .landing-plan-card as a crisp light card previewing the workspace UI, and fix .landing-session to use dark text on that light card while fixing .landing-experience-copy to use light text on the dark #090A0C section background:   CSS/* redesign.css — Lines 2119–2231 */
.landing-session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.landing-session {
  display: flex;
  align-items: center;
  gap: 14px;
  border-radius: 14px;
  border: 1px solid var(--border-color); /* Was rgba(255, 255, 255, 0.12) on #FFFFFF */
  background: var(--bg-subtle);
  padding: 12px 14px;
}

.landing-session.done {
  opacity: 0.78;
}

.landing-session.active {
  border-color: var(--primary);
  background: linear-gradient(90deg, rgba(232, 92, 74, 0.12), rgba(232, 92, 74, 0.03));
}

.landing-session-icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-accent-soft); /* Was rgba(255, 255, 255, 0.1) */
  color: var(--primary);             /* Was #F6F3EE on #FFFFFF (1.08:1!) */
  flex-shrink: 0;
}

.landing-session.done .landing-session-icon {
  background: #E8F2EC;
  color: #2F6B4F;
}

.landing-session > div {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.landing-session > div strong {
  color: var(--text-primary); /* Was #F6F3EE on #FFFFFF (1.08:1!) */
  font-size: 0.82rem;
  font-weight: 800;
}

.landing-session > div span {
  color: var(--text-secondary); /* Was rgba(246, 243, 238, 0.6) on #FFFFFF (1.04:1!) */
  font-size: 0.7rem;
}

/* Fix dark-on-dark in .landing-experience-copy (sits on #090A0C) */
.landing-experience-copy > p {
  max-width: 520px;
  margin: 18px 0 0;
  color: rgba(246, 243, 238, 0.76); /* Was var(--text-secondary) #4F5560 (2.65:1!) */
  font-size: 0.92rem;
  line-height: 1.8;
}

.landing-experience-points li {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1); /* Was var(--border-color) #E7E3DC */
}

.landing-experience-points strong {
  display: block;
  color: #F6F3EE; /* Was var(--text-primary) #101318 (1.07:1!) */
  font-size: 0.88rem;
  font-weight: 800;
}

.landing-experience-points p {
  margin: 5px 0 0;
  color: rgba(246, 243, 238, 0.72); /* Was var(--text-secondary) #4F5560 (2.65:1!) */
  font-size: 0.8rem;
  line-height: 1.65;
}
Fix .landing-final & .landing-footer Theme Continuity & Invisible #F6F3EE-on-#F6F3EE Elements (redesign.css lines 2233–2350):
Keep .landing-final and .landing-footer on the dark #090A0C / #101318 palette of .landing-shell so .landing-footer-brand strong (#F6F3EE), .landing-lang, and .landing-signin have full contrast, and make the .landing-final-card CTA button high-contrast white on the #E85C4A banner:   CSS/* redesign.css — Replace lines 2233–2350 */
.landing-final {
  padding: clamp(54px, 7vw, 92px) 28px;
  background: transparent; /* Was var(--bg-main) #F6F3EE */
}

.landing-final-actions .btn.btn-secondary {
  background: #FFFFFF;
  border-color: #FFFFFF;
  color: #101318;
}

.landing-final-actions .btn.btn-secondary:hover {
  background: #F6F3EE;
  border-color: #F6F3EE;
  color: #090A0C;
  transform: translateY(-1px);
}

.landing-footer {
  padding: 42px 28px 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.08); /* Was var(--border-color) */
  background: #090A0C; /* Was var(--bg-main) #F6F3EE, which made #F6F3EE text 1.00:1 invisible! */
}

.landing-footer-brand span {
  color: rgba(246, 243, 238, 0.64); /* Was var(--text-muted) */
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.landing-footer-note {
  max-width: 430px;
  margin: 0;
  color: rgba(246, 243, 238, 0.68); /* Was var(--text-muted) */
  font-size: 0.72rem;
  line-height: 1.65;
}

.landing-footer-bottom {
  margin-top: 28px;
  padding-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(246, 243, 238, 0.56);
  font-size: 0.65rem;
}
Fix LTR .link-btn .icon Arrow Direction (redesign.css lines 1612–1616):   CSS/* redesign.css — Lines 1612–1616: Include .link-btn .icon so forward links point right in LTR */
html[dir="ltr"] .landing-primary .icon,
html[dir="ltr"] .landing-how-cta .icon,
html[dir="ltr"] .landing-text-link .icon,
html[dir="ltr"] .link-btn .icon {
  transform: rotate(180deg);
}