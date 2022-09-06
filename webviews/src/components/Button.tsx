import { MouseEvent } from "react";

import { postActionMessage } from "./utils";

const onClickHandler = (evt: MouseEvent<HTMLButtonElement>) => postActionMessage(evt.currentTarget.id);

const Button = () => {
  return (
    <button id="button" onClick={onClickHandler}>
      Click to show message
    </button>
  );
};

export default Button;
