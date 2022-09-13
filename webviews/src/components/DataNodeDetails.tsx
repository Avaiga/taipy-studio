interface DataNodeProps {
    name: string,
    storage_type: string,
    scope: string,
}

const DataNodePanel = ({ name, storage_type, scope }: DataNodeProps) => {
    return (
        <div className='taipy-datanode-panel'>
            <h2>Data Node: {name}</h2>
            <ul>
                <li>Storage type: {storage_type}</li>
                <li>Scope: {scope}</li>
            </ul>
        </div>
    );
}

export default DataNodePanel;
