import hashlib


def md5_storage_hash(s):
    if isinstance(s, str):
        s = s.encode("utf8")
    m = hashlib.md5(s)
    return m.hexdigest()
