from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt

SECRET_KEY = ""
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_endcode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_endcode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_endcode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt