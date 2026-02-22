fn main() {
    // The Rust stable-x86_64-pc-windows-gnu toolchain bundles MinGW 14.1 whose
    // libpthread.a does not export `nanosleep64`.  That symbol is required by
    // aws-lc-sys >= 0.37 (pulled in transitively by rustls-platform-verifier).
    //
    // Fix: supply the full path to MSYS2 ucrt64's libpthread.a as an additional
    // linker argument.  GNU ld will extract `nanosleep64` from it to satisfy the
    // unresolved reference left by the bundled libpthread.a.
    //
    // The argument applies only to the final link step of our binary and test
    // binaries; build-script compilation is not affected.
    #[cfg(all(target_os = "windows", target_env = "gnu"))]
    {
        let ucrt64_pthread = "C:/msys64/ucrt64/lib/libpthread.a";
        if std::path::Path::new(ucrt64_pthread).exists() {
            println!("cargo:rustc-link-arg={ucrt64_pthread}");
        } else {
            // Fallback: try mingw64 (also has nanosleep64 in recent MSYS2 versions)
            let mingw64_pthread = "C:/msys64/mingw64/lib/libpthread.a";
            if std::path::Path::new(mingw64_pthread).exists() {
                println!("cargo:rustc-link-arg={mingw64_pthread}");
            }
        }
    }
}
