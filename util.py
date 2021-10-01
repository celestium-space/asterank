import hashlib


def md5_storage_hash(s):
    m = hashlib.md5.new(s)
    return m.hexdigest()
