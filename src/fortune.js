const WORDS = ["Seviyor", "Sevmiyor"];

function petalSvg(index, total) {
  const angle = (360 / total) * index;
  return `
    <button class="fal-petal" type="button" style="--a:${angle}deg" aria-label="Yaprak kopar">
      <span></span>
    </button>
  `;
}

export function bindFortune() {
  const meadow = document.getElementById("meadow");
  const daisy = document.getElementById("fortuneDaisy");
  const word = document.getElementById("fortuneWord");
  const reset = document.getElementById("fortuneReset");
  const stage = document.getElementById("fortuneStage");
  if (!meadow || !daisy) return;

  let remaining = [];
  let step = 0;

  const render = () => {
    const count = 12 + Math.floor(Math.random() * 5);
    daisy.innerHTML = `
      ${Array.from({ length: count }, (_, index) => petalSvg(index, count)).join("")}
      <span class="fal-heart">♥</span>
    `;
    remaining = [...daisy.querySelectorAll(".fal-petal")];
    step = 0;
    word.textContent = "Papatyaya dokun";
    word.removeAttribute("data-tone");
    reset.hidden = true;
    remaining.forEach((petal) => {
      petal.addEventListener("click", () => pick(petal));
    });
  };

  const pick = (petal) => {
    if (!petal || petal.classList.contains("is-gone")) return;
    petal.classList.add("is-gone");
    remaining = remaining.filter((item) => item !== petal);
    const label = WORDS[step % 2];
    word.textContent = label;
    word.dataset.tone = step % 2 ? "no" : "yes";
    step += 1;
    if (!remaining.length) {
      word.textContent = label === "Seviyor" ? "Seviyor. Kalpler bir." : "Sevmiyor... bu turda. Yeniden dene.";
      reset.hidden = false;
    }
  };

  for (let i = 0; i < 9; i += 1) {
    const bloom = document.createElement("button");
    bloom.type = "button";
    bloom.className = "meadow-daisy";
    bloom.style.left = `${8 + Math.random() * 84}%`;
    bloom.style.bottom = `${8 + (i % 3) * 22}%`;
    bloom.style.animationDelay = `${i * 0.35}s`;
    bloom.innerHTML = `<img src="/daisy.svg" alt="Papatya falı">`;
    bloom.addEventListener("click", () => {
      stage.classList.add("is-play");
      render();
      stage.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    meadow.appendChild(bloom);
  }

  daisy.addEventListener("click", (event) => {
    if (event.target.closest(".fal-petal") || remaining.length === 0) return;
    pick(remaining[0]);
  });

  reset.addEventListener("click", render);
  render();
}
