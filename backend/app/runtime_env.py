"""
Apply BLAS/thread limits before NumPy / OpenCV / SciPy load.
Reduces EXC_ARITHMETIC (SIGFPE) in OpenBLAS/Accelerate during linalg on macOS.
Import this module first in the process (see app.main).
"""
import os
import sys


def apply_blas_thread_limits() -> None:
    # Single-thread BLAS avoids races that surface as SIGFPE in inv/gemm on some macOS + Python 3.9 builds.
    pairs = [
        ("OPENBLAS_NUM_THREADS", "1"),
        ("OMP_NUM_THREADS", "1"),
        ("MKL_NUM_THREADS", "1"),
        ("NUMEXPR_NUM_THREADS", "1"),
        ("VECLIB_MAXIMUM_THREADS", "1"),
    ]
    for key, val in pairs:
        os.environ.setdefault(key, val)
    # If something (IDE, shell) already set multi-thread BLAS, setdefault leaves it — on darwin we force 1.
    if sys.platform == "darwin":
        for key, val in pairs:
            os.environ[key] = val
        os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"


def bootstrap() -> None:
    apply_blas_thread_limits()


# Side effect on import — main.py imports this before other app code.
bootstrap()
