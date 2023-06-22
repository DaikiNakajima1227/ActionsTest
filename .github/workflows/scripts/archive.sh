zip -r ${ARCHIVE_PATH} ${ARCHIVE_PATH} 
RETURN_CODE=$?
if [ ${RETURN_CODE} -ne 0 ]; then
    echo "圧縮処理に失敗しました。"
    exit 1
fi