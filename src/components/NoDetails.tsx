/* eslint-disable @typescript-eslint/naming-convention */
import Button from './Button';

interface NoDetailsProps {
    message: string
}
/*
        <>
        <script>
        function() {
            const vscode = acquireVsCodeApi();
        }()
        </script>
        </>
*/
function NoDetails({ message }: NoDetailsProps) {
    return (
        <div className='taipy-panel'>
            <span className='taipy-panel-info'>{message}</span>
           <Button></Button>
            </div>
    );
}

export default NoDetails;
