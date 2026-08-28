/*************************************************************
 * UNION ONE 출퇴근 — 연결 확인
 * 파일명: 연결확인.js
 *
 * 붙어야 할 곳이 다 붙었는지만 봅니다. 아무것도 바꾸지 않습니다.
 *************************************************************/
function 연결확인() {
  const 줄 = [];

  try {
    줄.push('근태 시트      →  ' + apiSs_().getName());
  } catch (error) {
    줄.push('근태 시트      →  실패. 스크립트 속성 SHEET_ID 를 확인하세요');
  }

  try {
    줄.push('워크보드 시트  →  ' + apiWorkboardSs_().getName());
  } catch (error) {
    줄.push('워크보드 시트  →  실패. 스크립트 속성 WORKBOARD_ID 를 확인하세요');
  }

  const 견적 = apiEstimateSs_();
  줄.push('견적 시트      →  ' + (견적 ? 견적.getName() : '실패. 스크립트 속성 ESTIMATE_ID 를 확인하세요'));

  try {
    줄.push('사진 폴더      →  ' + apiRootFolder_().getName());
  } catch (error) {
    줄.push('사진 폴더      →  실패. 폴더 ID 를 확인하세요');
  }

  try {
    const 현장들 = apiSites_();
    줄.push('현장 목록      →  ' + 현장들.length + '개  (사무실 · 기타현장 + 계약된 현장)');
    현장들.slice(0, 10).forEach(function (one) {
      줄.push('   ' + one.name + (one.folderId ? '' : '   (폴더 없음)'));
    });
    if (현장들.length > 10) 줄.push('   … 외 ' + (현장들.length - 10) + '개');
  } catch (error) {
    줄.push('현장 목록      →  실패. ' + (error && error.message ? error.message : error));
  }

  try {
    const ss = apiSs_();
    [SHEET_USERS, SHEET_LOG, SHEET_PHOTO].forEach(function (name) {
      const sheet = ss.getSheetByName(name);
      줄.push('탭 ' + name + '  →  ' + (sheet ? (sheet.getLastRow() - 1) + '줄' : '아직 없음'));
    });
  } catch (error) { /* 위에서 이미 알렸다 */ }

  const 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}


/*************************************************************
 * 탭 미리 만들기 — 처음 한 번만 실행하세요
 *************************************************************/
function 탭만들기() {
  apiSheet_(SHEET_USERS, HEADERS.USERS);
  apiSheet_(SHEET_LOG, HEADERS.LOG);
  apiSheet_(SHEET_PHOTO, HEADERS.PHOTO);

  const 결과 = '탭 3개를 준비했습니다 — ' + [SHEET_USERS, SHEET_LOG, SHEET_PHOTO].join(' · ');
  Logger.log(결과);
  return 결과;
}
