import { MouseEvent } from "react";

import { ELEMENT_IDS } from "../constants";
import { postActionMessage } from "./utils";

const onClickHandler = (evt: MouseEvent<HTMLButtonElement>) => postActionMessage(evt.currentTarget.id);

const Button = () => {
  return (
    <button id={ELEMENT_IDS.TRIGGER_MESSAGE_BUTTON} onClick={onClickHandler}>
      Click to show message
    </button>
  );
};

export default Button;
