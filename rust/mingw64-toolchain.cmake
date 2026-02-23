# CMake toolchain file for whisper.cpp on Windows with MSYS2 mingw64.
# Prevents cmake-rs from injecting /utf-8 (MSVC flag) into GCC CXX flags.
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_C_COMPILER   C:/msys64/mingw64/bin/gcc.exe)
set(CMAKE_CXX_COMPILER C:/msys64/mingw64/bin/g++.exe)
set(CMAKE_RC_COMPILER  C:/msys64/mingw64/bin/windres.exe)
set(CMAKE_AR           C:/msys64/mingw64/bin/ar.exe)

# Clear MSVC-injected flags — cmake-rs appends /utf-8 on Windows targets which GCC rejects.
set(CMAKE_C_FLAGS_INIT   "-ffunction-sections -fdata-sections -fPIC -m64 -w")
set(CMAKE_CXX_FLAGS_INIT "-ffunction-sections -fdata-sections -fPIC -m64 -w")
set(CMAKE_ASM_FLAGS_INIT "-ffunction-sections -fdata-sections -fPIC -m64 -w")
