// Asphalt 9 style page transitions, ported directly from the original AnimationEngine.
// It drives CSS classes on the rendered DOM (see styles/animations.css) so the timings,
// forced reflows and randomized box stagger behave exactly like the vanilla site.
// NOTE, NOT ALL BOX ANIMATIONS HAPPEN AT ONCE IN ASPHALT 9

export const PAGE_SWITCH_DELAY = 575;

export class AnimationEngine {
  private topBar: HTMLElement;
  private topBarFlashBox: HTMLElement;

  constructor(topBar: HTMLElement, topBarFlashBox: HTMLElement) {
    this.topBar = topBar;
    this.topBarFlashBox = topBarFlashBox;
  }

  revealPage(pageElement: HTMLElement) {
    // 1. Move the boxes out of view
    pageElement.querySelectorAll<HTMLElement>(".animatedBox").forEach((box) => {
      // Logic for sliding out based on direction
      box.classList.remove("is-hidden", "is-hidden-to-right", "reveal");
      if (box.classList.contains("right")) {
        box.classList.add("is-hidden-to-right");
      } else {
        box.classList.add("is-hidden");
      }
      box.style.transition = "transform 0.4s ease-in";
      box.classList.remove("is-visible");
    });

    pageElement.querySelectorAll<HTMLElement>(".animatedCloak").forEach((cloak) => {
      cloak.classList.remove("hide", "hideRight", "reveal");
      cloak.style.transition = "clip-path 1s ease";
      cloak.classList.add("hideRight");
      cloak.getBoundingClientRect();
      cloak.classList.remove("hideRight");
      cloak.classList.add("reveal");
      cloak.style.transition = "clip-path 0.2s ease";

      if (cloak.classList.contains("topdown")) {
        cloak.classList.add("hideBottom");
        cloak.getBoundingClientRect();
        cloak.classList.remove("hideBottom");
        cloak.classList.add("reveal");
        cloak.style.transition = "clip-path 0.5s ease";
      }
    });

    this.topBar.classList.remove("curtainClose");
    setTimeout(() => {
      this.topBarFlashBox.style.opacity = "0";
    }, 200);
  }

  hidePage(pageElement: HTMLElement) {
    // Slide the boxes in to cover the content, each with a small random delay
    setTimeout(() => {
      pageElement.querySelectorAll<HTMLElement>(".animatedBox").forEach((box) => {
        const randomNumber = Math.floor(Math.random() * 100) + 1;
        box.classList.remove("is-hidden", "is-hidden-to-right", "reveal");
        setTimeout(() => {
          box.classList.add("is-visible");
        }, randomNumber);
        box.style.transition = "transform 0.1s ease-in";
      });
    }, 100);

    setTimeout(() => {
      pageElement.querySelectorAll<HTMLElement>(".animatedCloak").forEach((cloak) => {
        cloak.classList.remove("hide", "reveal", "hideRight");
        cloak.getBoundingClientRect();
        if (cloak.classList.contains("topdown")) cloak.classList.add("hideBottom");
        else cloak.classList.add("hide");
        cloak.style.transition = "clip-path 0.3s ease";
      });
    }, 200);

    this.topBar.classList.add("curtainClose");
    this.topBarFlashBox.style.opacity = "1";
    setTimeout(() => {
      this.topBarFlashBox.style.opacity = "0";
    }, 200);
  }
}
