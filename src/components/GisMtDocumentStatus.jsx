import { Button, Popover, Space, Tag, message } from 'antd';
import { downloadGisReceipt } from '../api/diadoc';

const colors = { Success: 'green', Error: 'red', Warning: 'orange', Normal: 'blue' };

export default function GisMtDocumentStatus({ document }) {
    const receipts = document.gis_mt_receipts || [];
    if (!receipts.length) {
        return document.metadata?.gis_mt_expected && !document.is_draft && document.status !== 'rejected'
            ? <Tag>ГИС МТ · ожидается квитанция</Tag> : null;
    }
    const download = async (receipt) => {
        try {
            await downloadGisReceipt(document, receipt);
        } catch {
            message.error('Не удалось скачать квитанцию ГИС МТ');
        }
    };
    const history = (
        <Space direction="vertical" style={{ maxWidth: 460, maxHeight: 320, overflow: 'auto' }}>
            {receipts.map((receipt) => (
                <div key={receipt.entity_id}>
                    {receipt.scope === 'revocation' && 'Аннулирование · '}
                    {receipt.label} ({receipt.status})
                    {receipt.description && <div>{receipt.description}</div>}
                    {receipt.details.map((detail, index) => (
                        <div key={index}>{[detail.Code, detail.Text].filter(Boolean).join(' · ')}</div>
                    ))}
                    {receipt.filename && (
                        <Button type="link" size="small" onClick={() => download(receipt)}>
                            Скачать квитанцию
                        </Button>
                    )}
                </div>
            ))}
        </Space>
    );
    const current = receipts.filter((receipt) => receipt.current);
    return (
        <Popover title="Квитанции «Честного знака»" content={history} trigger="click">
            <Button type="text" size="small" style={{ height: 'auto', whiteSpace: 'normal' }}>
                {current.length ? current.map((receipt) => (
                    <Tag key={receipt.entity_id} color={colors[receipt.type]}>
                        ГИС МТ · {receipt.scope === 'revocation' && 'аннулирование · '}{receipt.label}
                    </Tag>
                )) : 'ГИС МТ · история квитанций'}
            </Button>
        </Popover>
    );
}
