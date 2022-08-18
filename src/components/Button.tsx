/* eslint-disable @typescript-eslint/naming-convention */
import { Constants } from '../constants';
function Button() {
    return (
        <button id={Constants.ELEMENT_IDS.TRIGGER_MESSAGE_BUTTON}>
            Click to show message
        </button>
    );
}

export default Button;
