/*************************************************************
 * UNION ONE 출퇴근 — 보기용 집계표
 * 파일명: 집계.js
 *
 * 일별 · 월별 · 연별로 자동 계산되는 탭을 만듭니다.
 * 한 번만 실행하면 되고, 그다음부터는 기록이 쌓일 때마다
 * 시트가 알아서 다시 계산합니다. 직접 입력하지 마세요.
 *************************************************************/

function 집계표만들기() {
  const ss = apiSs_();
  const 로그 = [];

  /* ── 오늘 누가 나왔나 ───────────────────────────── */
  만들기_(ss, SHEET_DAY,
    ['날짜', '이름', '현장', '출근', '퇴근', '상태', '근무시간'],
    "=IFERROR(QUERY('" + SHEET_LOG + "'!A2:S, \"select A, B, Q, D, I, N, S " +
    "where A = '\"&TEXT(TODAY(),\"yyyy-mm-dd\")&\"' order by D\", 0), \"오늘 기록이 아직 없습니다\")",
    [110, 100, 200, 100, 100, 90, 100],
    '오늘 출퇴근 현황입니다. 자동 계산이라 직접 입력하지 마세요.');
  로그.push(SHEET_DAY);

  /* ── 이번 달 사람별 ─────────────────────────────── */
  만들기_(ss, SHEET_MONTH,
    ['이름', '근무일수', '총근무시간'],
    "=IFERROR(QUERY('" + SHEET_LOG + "'!A2:S, \"select B, count(A), sum(S) " +
    "where A >= '\"&TEXT(EOMONTH(TODAY(),-1)+1,\"yyyy-mm-dd\")&\"' " +
    "group by B order by B label count(A) '', sum(S) ''\", 0), \"이번 달 기록이 아직 없습니다\")",
    [120, 110, 130],
    '이번 달 사람별 집계입니다. 자동 계산이라 직접 입력하지 마세요.');
  로그.push(SHEET_MONTH);

  /* ── 월별 추이 ──────────────────────────────────── */
  만들기_(ss, SHEET_YEAR,
    ['월', '근무건수', '총근무시간'],
    "=IFERROR(QUERY({ARRAYFORMULA(LEFT('" + SHEET_LOG + "'!A2:A,7)), '" + SHEET_LOG + "'!B2:B, '" +
    SHEET_LOG + "'!S2:S}, \"select Col1, count(Col2), sum(Col3) " +
    "where Col1 is not null and Col1 <> '' " +
    "group by Col1 order by Col1 desc label count(Col2) '', sum(Col3) ''\", 0), \"기록이 아직 없습니다\")",
    [110, 110, 130],
    '월별 추이입니다. 자동 계산이라 직접 입력하지 마세요.');
  로그.push(SHEET_YEAR);

  const 결과 = '집계표 준비 완료 — ' + 로그.join(' · ');
  Logger.log(결과);
  return 결과;
}


function 만들기_(ss, 이름, 제목들, 수식, 너비들, 설명) {
  const 탭 = ss.getSheetByName(이름) || ss.insertSheet(이름);

  const 제목범위 = 탭.getRange(1, 1, 1, 제목들.length);
  제목범위.setValues([제목들]);
  제목범위
    .setFontWeight('bold')
    .setFontSize(10)
    .setBackground('#13395B')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  탭.setFrozenRows(1);
  탭.setRowHeight(1, 32);

  제목들.forEach(function (_, i) {
    탭.setColumnWidth(i + 1, (너비들 && 너비들[i]) || 120);
  });

  const 여분 = 탭.getMaxColumns() - 제목들.length;
  if (여분 > 0) 탭.deleteColumns(제목들.length + 1, 여분);

  탭.getRange('A2').setFormula(수식);
  탭.getRange('A1').setNote(설명);
}
