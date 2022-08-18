/* eslint-disable @typescript-eslint/naming-convention */
import Button from './Button';

interface PanelProps {
    message: string
}

function Panel({ message }: PanelProps) {
    return (
        <div className='taipy-panel'>
            <span className='taipy-panel-info'>{message}</span>
           <Button></Button>
        </div>
    );
}

export default Panel;
