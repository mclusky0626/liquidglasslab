# Liquid Glass Lab

Apple의 **리퀴드 글래스(Liquid Glass)** 를 HTML, CSS, SVG로 만들고, 직접 끌고 누르고 값을 바꿔 보며 배우는 참여형 학습 페이지입니다.
구성은 Apple의 [AirPods Pro 소개 페이지](https://www.apple.com/kr/airpods-pro/)처럼 고정 로컬 내비게이션, 큰 헤드라인, 하이라이트 갤러리, 타일, 비교 표, 각주로 이어집니다.

## 실행

빌드 과정이 없습니다. `index.html`을 브라우저로 열면 됩니다.

```bash
# 또는 간단한 로컬 서버
python3 -m http.server 8000
# → http://localhost:8000
```

굴절은 브라우저에 따라 두 가지 방식으로 그립니다.

- **Chrome, Edge 등 Chromium 계열:** `backdrop-filter: url(#필터)`로 유리 뒤 화면을 바로 굴절시킵니다.
- **Safari(아이패드·아이폰의 모든 브라우저 포함), Firefox:** 이 방식을 지원하지 않아 *거울 방식*을 씁니다. 유리 뒤에 있는 요소를 복제해 유리 안에 같은 위치로 깔고, 그 복제본에 일반 `filter: url(#필터)`를 겁니다. 거울 대상이 지정되지 않은 유리는 `blur()` 대체 스타일로 보입니다.

Chromium에서 주소 끝에 `?lg=mirror`를 붙이면 거울 방식을 시험해 볼 수 있습니다.

## 페이지 구성

| 섹션 | 직접 해 볼 것 |
| --- | --- |
| 히어로 | 유리 렌즈를 끌어 큰 글자 위로 옮기기, 렌즈 모양 바꾸기 (캡슐 · 원 · 카드) |
| 일단 핵심부터 | 굴절 · 반사광 · 유동성 · 적응형 색조 · 레이어 갤러리 넘기기, 재생/일시 정지 |
| 구조 | 네 레이어(흐림·굴절 / 프레넬 / 테두리 / 동적 조명)를 하나씩 끄고 켜기, 분해도 펼치기 |
| 굴절 | 굴절 강도 · 베젤 · 색수차 · 흐림 · 반경을 바꾸며 생성되는 SVG 필터 코드와 변위 맵 보기 |
| 광학 | 스넬의 법칙 도해에서 빛줄기를 끌고 굴절률을 바꿔 굴절각 · 밀림 거리 · 프레넬 반사율 읽기 |
| 인터랙션 | 유리로 변하는 세그먼트 컨트롤 · 스위치 · 슬라이더, 페이지 전체에 적용되는 스프링 곡선 |
| 사용 경험 | 사진 보관함(줄어드는 탭 바, 사진 보기와 넘기기), 떠 있는 내비게이션 버튼, Apple 공식 제어 센터 화면 위의 버튼 · 밝기 · 음량 조작, 잠금 화면의 알림 펼치기와 손전등 |
| 직접 만들기 | 프리셋 · 모양 · 배경 · 광학 · 표면 값을 바꾸고 **동작하는 HTML 파일 전체를 복사** |
| 성능 | 유리 개수와 방식(굴절 / 블러 / 없음)을 바꾸며 이 기기의 fps 측정 |
| 비교 | 리퀴드 글래스 · 글래스모피즘 · iOS 7 반투명 비교, 각 스타일로 빌더 열기 |
| 접근성 | 투명도 줄이기 · 동작 줄이기 · 대비 높이기를 페이지 전체에 적용 |

## 원리 요약

```
배경 ─► feGaussianBlur ─► feDisplacementMap(변위 맵) ─► R·G·B 분리 후 screen 합성 ─► saturate
                                   ▲
                 캔버스로 그린 변위 맵 (R = 가로, G = 세로, 128 = 제자리)
```

1. `js/glass.js`가 요소의 크기 · 모서리 반경 · 베젤 폭으로 변위 맵을 그립니다. 가장자리에서 안쪽으로 들어갈수록 원호 모양으로 변위가 줄어 평평한 가운데는 그대로 보입니다.
2. 맵을 SVG `<feImage>`로 불러와 `<feDisplacementMap>`으로 배경 픽셀을 밀어냅니다.
3. `backdrop-filter: url(#필터)`로 요소 뒤의 화면에 겁니다. 지원하지 않는 브라우저에서는 뒤쪽 요소의 복제본에 `filter: url(#필터)`를 겁니다.
4. 그 위에 프레넬 그라데이션(`::before`), 원뿔형 테두리 링(`::after`), 포인터를 따라가는 방사형 조명을 겹칩니다.

## 파일

```
index.html      페이지 마크업
css/style.css   디자인 토큰, 유리 컴포넌트, 섹션 스타일
js/glass.js     굴절 엔진 (변위 맵 생성 + SVG 필터 연결)
js/main.js      섹션별 인터랙션
assets/         Apple 공식 화면 이미지, 배경 일러스트
```

`glass.js`는 다른 프로젝트에서도 쓸 수 있습니다.

```html
<div class="glass" id="card">…</div>
<script src="js/glass.js"></script>
<script>
  LiquidGlass.attach(document.getElementById('card'), {
    refraction: 70,   // 굴절 강도 (feDisplacementMap scale)
    bezel: 24,        // 굴절이 일어나는 가장자리 폭(px)
    dispersion: 0.3,  // 색수차 0~1
    blur: 1.5,        // 굴절 전 흐림(px)
    saturation: 1.6,  // 채도
    mirror: document.querySelector('.stage'), // Safari·Firefox에서 유리 안에 복제할 뒤쪽 요소 (선택)
  });
</script>
```

## 참고

- velog, [「Apple Liquid Glass UI 패턴」](https://velog.io/@tristanjung1006/Web-Apple-Liquid-Glass-UI-%ED%8C%A8%ED%84%B4): 레이어 구성, 스프링 곡선 `cubic-bezier(0.34, 1.56, 0.64, 1)`, 드래그 임계값과 탄성 범위
- [Apple Human Interface Guidelines · Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- MDN [`backdrop-filter`](https://developer.mozilla.org/ko/docs/Web/CSS/backdrop-filter), [`feDisplacementMap`](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDisplacementMap)

Apple, iPhone, Liquid Glass는 Apple Inc.의 상표이며, `assets/apple-*.png`는 Apple이 공개한 이미지입니다. 배경 일러스트(`assets/illust-*.jpg`)의 저작권은 각 저작권자에게 있습니다(【推しの子】 © 赤坂アカ×横槍メンゴ／集英社・【推しの子】製作委員会). 이 저장소는 Apple과 관련이 없는 학습용 데모입니다.
