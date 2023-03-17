import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import classnames from "classnames";

import { isSet } from "components/utils";
import { ConfigData } from "juju/api";

export type SetNewValue = (name: string, value: any) => void;

export type ConfigProps = {
  config: ConfigData;
  selectedConfig: ConfigData | undefined;
  setSelectedConfig: Function;
  setNewValue: SetNewValue;
};

type Props<V> = ConfigProps & {
  input: (value: V) => ReactNode;
};

const ConfigField = <V,>({
  config,
  input,
  selectedConfig,
  setSelectedConfig,
  setNewValue,
}: Props<V>): JSX.Element => {
  const [inputFocused, setInputFocused] = useState(false);
  const [inputChanged, setInputChanged] = useState(false);
  const [showUseDefault, setShowUseDefault] = useState(
    config.value !== config.default
  );
  const [showDescription, setShowDescription] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [maxDescriptionHeight, setMaxDescriptionHeight] = useState<string>();

  let inputValue = config.default;
  if (isSet(config.newValue)) {
    inputValue = config.newValue;
  } else if (config.default !== config.value) {
    inputValue = config.value;
  }

  const updateDescriptionHeight = useCallback(() => {
    if (
      // Don't update if the height has already been retrieved.
      !maxDescriptionHeight &&
      descriptionRef.current?.firstChild &&
      // Don't try and update if the element is not visible.
      descriptionRef.current?.offsetParent !== null
    ) {
      setMaxDescriptionHeight(
        `${
          (descriptionRef.current.firstChild as HTMLPreElement).clientHeight
        }px`
      );
    }
  }, [maxDescriptionHeight]);

  const resizeObserver = useMemo(
    () => new ResizeObserver(updateDescriptionHeight),
    [updateDescriptionHeight]
  );

  useEffect(() => {
    if (maxDescriptionHeight) {
      // There's no need to keep observing the element once the height has
      // been retrieved.
      resizeObserver.disconnect();
    }
  }, [maxDescriptionHeight, resizeObserver]);

  useEffect(() => {
    const descriptionElement = descriptionRef.current;
    if (!descriptionElement) {
      return;
    }
    // Attempt to set the height if the element is visible.
    updateDescriptionHeight();
    // On larger screens the description is hidden so the element needs to be
    // observed for when the screen is resized down and it becomes visible so
    // that the height can be retrieved.
    resizeObserver.observe(descriptionElement);
    return () => {
      if (descriptionElement) {
        resizeObserver.unobserve(descriptionElement);
      }
    };
  }, [updateDescriptionHeight, resizeObserver]);

  useEffect(() => {
    if (!descriptionRef.current) {
      return;
    }
    if (showDescription) {
      descriptionRef.current.style.maxHeight = maxDescriptionHeight ?? "0px";
    } else {
      descriptionRef.current.style.maxHeight = "0px";
    }
  }, [showDescription, maxDescriptionHeight]);

  useEffect(() => {
    setInputFocused(selectedConfig?.name === config.name);
  }, [selectedConfig, config]);

  useEffect(() => {
    if (
      (isSet(config.newValue) && config.newValue !== config.default) ||
      (!isSet(config.newValue) && config.value !== config.default)
    ) {
      setShowUseDefault(true);
    } else {
      setShowUseDefault(false);
    }

    if (isSet(config.newValue) && config.newValue !== config.value) {
      setInputChanged(true);
    } else {
      setInputChanged(false);
    }
  }, [config]);

  function resetToDefault() {
    setNewValue(config.name, config.default);
  }

  function handleShowDescription() {
    setShowDescription(!showDescription);
  }

  return (
    // XXX How to tell aria to ignore the click but not the element?
    // eslint-disable-next-line
    <div
      className={classnames("config-input", {
        "config-input--focused": inputFocused,
        "config-input--changed": inputChanged,
      })}
      data-testid={config.name}
      onClick={() => setSelectedConfig(config)}
    >
      <h5 className="u-float-left">
        {config.description ? (
          <i
            className={classnames("config-input--view-description", {
              "p-icon--plus": !showDescription,
              "p-icon--minus": showDescription,
            })}
            onClick={handleShowDescription}
            onKeyPress={handleShowDescription}
            role="button"
            tabIndex={0}
          />
        ) : null}
        {config.name}
      </h5>
      <button
        className={classnames(
          "u-float-right p-button--base config-panel__hide-button",
          {
            "config-panel__show-button": showUseDefault,
          }
        )}
        onClick={resetToDefault}
      >
        use default
      </button>
      <div
        className={classnames("config-input--description")}
        ref={descriptionRef}
      >
        <pre className="config-input--description-container">
          {config.description}
        </pre>
      </div>
      {input(inputValue)}
    </div>
  );
};

export default ConfigField;
