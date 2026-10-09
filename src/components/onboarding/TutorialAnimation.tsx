import React from "react";
import { useTranslation } from "react-i18next";

/**
 * What the animation acts out:
 * - keys: the shortcut keys light up in turn ("these are your keys")
 * - hold: keys go down, you speak, keys come up, the text appears
 * - tap: a quick tap, you speak, another tap, the text appears
 * - touchpad: two fingers rest until the timer fills, you speak, they lift
 */
export type TutorialScene = "keys" | "hold" | "tap" | "touchpad";

interface TutorialAnimationProps {
  scene: TutorialScene;
  keys: string[];
}

/** Sound bars shown while "speaking". */
const Voice: React.FC = () => (
  <span className="tut-voice" aria-hidden="true">
    {[0, 1, 2, 3, 4].map((bar) => (
      <span
        key={bar}
        className="tut-bar"
        style={{ animationDelay: `${bar * 90}ms` }}
      />
    ))}
  </span>
);

/** A text box whose line fills in once the dictation lands. */
const TextBox: React.FC = () => (
  <span className="tut-textbox" aria-hidden="true">
    <span className="tut-line" />
    <span className="tut-line tut-line-short" />
  </span>
);

/**
 * A short looping picture of what to do on the current tutorial step. Built
 * from a few elements animated with transform and opacity only, so it stays
 * cheap while the speech engine downloads; it holds still for people who ask
 * for reduced motion.
 */
export const TutorialAnimation: React.FC<TutorialAnimationProps> = ({
  scene,
  keys,
}) => {
  const { t } = useTranslation();

  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        className={`tut-stage tut-scene-${scene}`}
        role="img"
        aria-label={t(`firstRun.animation.${scene}`)}
      >
        {scene === "touchpad" ? (
          <span className="tut-pad" aria-hidden="true">
            <span className="tut-finger tut-finger-a" />
            <span className="tut-finger tut-finger-b" />
            <span className="tut-timer">
              <span className="tut-timer-fill" />
            </span>
          </span>
        ) : (
          <span className="tut-keys" aria-hidden="true">
            {keys.map((key, index) => (
              <kbd
                key={`${key}-${index}`}
                className="tut-key"
                style={
                  scene === "keys"
                    ? { animationDelay: `${index * 450}ms` }
                    : undefined
                }
              >
                <span className="tut-key-glow" />
                <span className="relative">{key}</span>
              </kbd>
            ))}
          </span>
        )}
        {scene !== "keys" && (
          <>
            <Voice />
            <TextBox />
          </>
        )}
      </div>
      <figcaption className="text-center text-xs font-medium text-text/70">
        {t(`firstRun.animation.${scene}`)}
      </figcaption>
    </figure>
  );
};
