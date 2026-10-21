/** Studios V3 presentation for the existing P5 editor DOM and behavior. */
export const videoPackagingTheme = String.raw`
  :root{--muted:#706b7d;--line:#e9e4ee;--surface:#fff;--ink:#2d2938;--green:#704bb2;--green-soft:#f2ecfa;--amber:#b88a4b}
  body{min-width:0!important;background:#f8f7fa;color:var(--ink);font-size:14px}
  .topbar{height:60px;gap:16px;padding:0 20px;border-color:#ebe6f0;background:#fff}
  .brand{min-width:150px}.brand-mark{width:36px;height:36px;border-radius:11px;background:#704bb2;font-size:17px}
  .brand strong{color:#302b3b;font-size:16px}.brand small{color:#756c84;font-size:11px;letter-spacing:.08em}
  .project-title{min-width:0;gap:10px;color:#3d364b;font-size:15px}.project-title #project-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .status-dot{flex:none;background:#8261bf;box-shadow:0 0 0 3px #eee8f8}.save-state{flex:none;color:#615a70;font-size:13px}
  .runtime-badge{flex:none;padding:5px 8px;border-color:#e4d9f1;border-radius:7px;color:#644893;background:#f6f1fc;font-size:12px}
  .button{height:40px;border-radius:9px;font-size:14px}.button.secondary{border-color:#ded7e8;color:#554a68;background:#fff}.button.primary{background:#704bb2;box-shadow:0 4px 10px #64469424}.button:hover{filter:brightness(.96)}
  .workspace{position:relative;height:calc(100vh - 60px);display:grid;grid-template-areas:'library preview inspector' 'timeline timeline timeline';grid-template-columns:minmax(210px,250px) minmax(0,1fr) minmax(245px,285px);grid-template-rows:minmax(0,1fr) 230px;gap:10px;padding:10px;overflow:hidden}
  .center-column{display:contents}.library{grid-area:library}.inspector{grid-area:inspector}.preview-panel{grid-area:preview}.timeline-panel{grid-area:timeline}
  .panel{min-width:0;min-height:0;border-color:#e7e1ed;border-radius:14px;box-shadow:0 3px 16px #392d5009}
  .library,.inspector{padding:18px 15px;overscroll-behavior:contain}
  .panel h2,.timeline-header h2{color:#342e40;font-size:18px}.section-title h3{color:#51485d;font-size:14px}
  .eyebrow{color:#7d6b9b;font-size:11px;letter-spacing:.1em}.count,.live-label{color:#6f647e;font-size:12px}
  .asset-section,.component-section,.project-section{margin-top:22px}.section-title{gap:8px}
  .import-drop,.subtitle-drop{height:auto;min-height:82px;border-color:#d9cfe8;border-radius:10px;background:#fcfaff}
  .import-drop:hover,.subtitle-drop:hover{border-color:#a98fce;background:#f8f3fd}.upload-icon{color:#7754b5;font-size:21px}
  .import-drop strong,.subtitle-drop b,.component-add b,.asset-card b,.project-file b,.visual-asset-entry b,.asset-recommendation-copy b,.proposal-card b{color:#403847;font-size:14px}
  .import-drop small,.subtitle-drop small,.component-add small,.asset-card,.project-file small,.visual-asset-entry small,.privacy-note,.transcript-status,.fixture-note,.plan-empty,.proposal-card small,.asset-recommendation-empty,.recommendation-review,.asset-recommendation-copy small,.asset-inspector-note{color:#696374;font-size:12px;line-height:1.5}
  .asset-card,.component-add,.project-file,.visual-asset-entry,.asset-recommendation-card,.proposal-card{border-color:#e7e1ed;border-radius:10px;background:#fff}
  .asset-card b,.visual-asset-entry b{overflow-wrap:anywhere}.asset-card span{color:#756b82;font-size:12px}
  .component-add{min-height:64px;gap:10px;padding:10px}.component-add:hover{border-color:#ad97cf;background:#faf7fe}
  .component-icon{width:34px;height:34px;font-size:16px}.title-icon{color:#714fa9;background:#f0eafa}.highlight-icon{color:#a67b45;background:#fbf3e9}.info-icon{color:#5d6d91;background:#eef2f9}
  .fixture-note,.privacy-note{padding:9px;border-radius:8px;background:#f7f3fc}.privacy-note{margin:10px 0}
  .transcript-editor,.library-registration input,.recommendation-placement input,.field input,.field textarea,.field select,.recommendation-choice select,.library-asset-actions select{min-width:0;min-height:40px;padding:9px 10px;border:1px solid #ded7e8;border-radius:8px;color:#34303c;background:#fff;font:14px/1.45 Manrope,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
  .transcript-editor{min-height:130px}.field textarea{min-height:86px}.field input[type=color]{min-height:40px}.field input[type=range]{min-height:0;accent-color:#7957b9}
  .field-label,.recommendation-placement label,.aspect-lock,.recommendation-actions span{color:#5c5568;font-size:13px}.field-help{color:#746d7d;font-size:12px}.field-row{gap:9px}.field-row.triple{grid-template-columns:repeat(3,minmax(0,1fr))}
  .transcript-save,.plan-button,.plan-apply,.asset-recommendation-section>.button{width:100%;min-height:40px;height:auto;font-size:14px}
  .recommendation-choice select,.recommendation-placement input,.recommendation-actions button,.library-asset-actions button,.library-asset-actions select{font-size:13px}.recommendation-actions button{min-height:38px}
  .visual-import{min-height:76px;height:auto}.library-group>strong{color:#544b62;font-size:13px}.library-registration{gap:7px}.library-registration input{font-size:13px}
  .preview-panel{padding:14px 18px 10px}.preview-toolbar{gap:12px;flex-wrap:wrap}.preview-toolbar>div:first-child{gap:11px;flex-wrap:wrap}.preview-toolbar strong{color:#493c61;font-size:14px}.video-meta{color:#6f687b;font-size:13px}
  .icon-button{height:38px;min-width:38px;border-color:#dfd7e9;border-radius:8px;color:#5d4a7e;font-size:16px}.icon-button:hover{background:#f4effa}.fit-button{font-size:13px}
  .stage-wrap{min-height:0;padding:10px 4px}.stage{border-radius:9px;box-shadow:0 9px 25px #1d18232b}.empty-stage strong{font-size:15px}.empty-stage span{font-size:12px}
  .preview-foot{height:28px;color:#6c6578;font-size:12px}.tiny-dot{background:#8c6aba}
  .timeline-panel{padding:13px 18px 10px}.timeline-header{margin-bottom:8px}.timeline-tools{gap:7px;color:#6f687a;font-size:13px}.timeline-tools .icon-button{height:34px;min-width:34px}
  .timeline-scroll{min-width:0}.timeline-content{min-width:760px}.ruler-row,.track-row{height:44px}.track-label{flex-basis:110px;color:#635c6b;font-size:12px}.ruler-label,.tick{font-size:11px}.track-name{color:#625b6c;font-size:12px}.clip{top:8px;height:28px;border-radius:6px;font-size:12px}.playhead{left:110px;background:#9568bc}.playhead span{background:#9568bc}
  .timeline-foot{gap:12px;color:#716a7a;font-size:12px}.timeline-foot span:last-child{font-size:12px}
  .inspector{position:relative}.inspector-empty{color:#766e7e}.inspector-empty strong{color:#4b415a;font-size:15px}.inspector-empty span{font-size:12px}.select-glyph{color:#8163ad}
  .inspector-fields{margin-top:17px}.field-group{border-color:#eee9f2}.aspect-lock{font-size:13px}.opacity-row output{font-size:12px}
  .render-status{position:static;max-height:150px;overflow:auto;margin-top:16px;padding:12px;border-color:#e5dbef;border-radius:9px;color:#53466b;background:#f7f2fc;font-size:13px;line-height:1.5}.render-status.error{border-color:#e8caca;color:#914b4b;background:#fff6f6}.render-status a{color:#674795}
  .toast{max-width:min(90vw,480px);border-radius:10px;background:#40334f;font-size:13px}
  .dsh-hide-library .workspace{grid-template-areas:'preview preview inspector' 'timeline timeline timeline';grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(245px,285px)}
  .dsh-hide-inspector .workspace{grid-template-areas:'library preview preview' 'timeline timeline timeline';grid-template-columns:minmax(210px,250px) minmax(0,1fr) minmax(0,1fr)}
  .dsh-hide-library.dsh-hide-inspector .workspace{grid-template-areas:'preview preview preview' 'timeline timeline timeline';grid-template-columns:repeat(3,minmax(0,1fr))}
  @media(max-width:1100px){.workspace{grid-template-columns:minmax(180px,215px) minmax(0,1fr) minmax(210px,245px);grid-template-rows:minmax(0,1fr) 215px;gap:8px;padding:8px}.library,.inspector{padding:14px 11px}}
  @media(max-width:980px){
    .workspace,.dsh-hide-library .workspace,.dsh-hide-inspector .workspace,.dsh-hide-library.dsh-hide-inspector .workspace{position:relative;grid-template-areas:'preview' 'timeline';grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) 205px}
    .library,.inspector{position:absolute;z-index:8;top:8px;bottom:8px;width:min(330px,calc(100% - 24px));max-height:none;box-shadow:0 14px 36px #30283a30}
    .library{left:8px}.inspector{right:8px}
    .dsh-hide-library .library,.dsh-hide-inspector .inspector{display:none}
    .timeline-content{min-width:700px}
  }
  @media(max-width:680px){.topbar{height:auto;min-height:60px;flex-wrap:wrap;padding:8px 12px}.brand{min-width:0}.project-title{flex:1 1 180px}.top-actions{margin-left:auto}.workspace{height:calc(100vh - 100px)}.timeline-foot{flex-wrap:wrap}.timeline-content{min-width:620px}}
`
