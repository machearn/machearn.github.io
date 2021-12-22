---
title: 利用docker在M1 Mac上搭建Kernel交叉编译、调试环境
date: 2021-12-21 22:36:58
categories:
- Programming
- Environment
tags:
- Cross Compile
- Kernel
- Docker
- Apple Silicon
- QEMU
---

## 背景
之前学习 MIT 6.828 的时候，都是在 x86_64 平台上，而且编译用的工具链都是 GNU 的编译工具链。所以即使在使用 Intel CPU 的 MBP 的时候，也都是在虚拟机中进行编译和调试工作。在虚拟机中运行QEMU虚拟机，显得十分笨重。

随着 2021 款 M1pro MBP 的到货，我开始在新 Mac 上搭建工作环境。昨天在一篇博客的评论区，有位内核开发者提到了他利用 docker 在M1 MacBook Air 上搭建内核开发工作流。这个评论给了我灵感，当即决定也尝试着建立自己的交叉编译和调试的内核开发环境。

我的开发环境由 docker 镜像和本地 QEMU 两部分组成。Docker 镜像负责编译和调试内核代码，本地 QEMU 运行编译好的内核。

## Docker环境
Docker 容器支持本地目录挂载到镜像的文件系统，所以我们可以在启动镜像的时候挂载内核代码目录，然后使用容器中的 gcc 编译内核代码。同时，由于宿主机使用的 CPU 是 ARM 架构，所以需要在运行 docker 镜像时使用 `--platform linux/amd64` 指定镜像的版本，即 x86_64 架构的 Linux。下面是具体的命令
```bash
    docker run --rm -it --platform linux/amd64 -it -v /path/to/code:/mount/path image_name /bin/bash
```
其中 `-v /path/to/code:/mount/path` 就是指定挂载的源路径和目标路径。其他的参数可以通过 `docker --help` 来查看含义和用法。

由于指令过长，不便记忆，可以在 shell 的配置文件中编写一个函数。
```bash
amd64gcc() {
    docker run --rm -it --platform linux/amd64 -it -v $1:$2 image_name /bin/bash
}
```
然后，就可以通过 `amd64gcc /path/to/code /mount/path` 来执行之前的指令了。

## 编译调试
### 编译
docker 部署好后，就可以进行编译和调试了。这里使用 xv6 代码来进行演示。xv6 已经写好了 makefile 定义了一些 target。在容器中执行 `make` 就能完成编译。但是，makefile 中定义的将内核加载进 QEMU 执行的 target，也是带着编译目标的，比如
```makefile
qemu-nox: fs.img xv6.img
        $(QEMU) -nographic $(QEMUOPTS)
```
这个 target，在执行 QEMU 之前，还需要编译，这样我们在宿主机上使用 `make qemu-nox` 执行这个 target 的时候，make 就会先进行编译。然后编译器就会报错，因为内核代码里面有很多 x86_64 的汇编代码，无法通过编译。所以我把这个 target 修改成
```makefile
qemu-nox:
        $(QEMU) -nographic $(QEMUOPTS)
```
这样就只执行，不编译了。因为 makefile 中，target 的第一行就是指定编译的目标文件，当我们把它去掉后，就去掉了编译过程。
### 调试
xv6 使用了 gdbinit 来设置 gdb 的调试参数，使用了 `gdbinit.tmpl` 来协助配置文件的生成。下面这两条就是配置文件生成相关的 makefile 语句
```makefile
# 用来生成唯一的端口号
GDBPORT = $(shell expr `id -u` % 5000 + 25000)
# 用来生成 gdbinit
.gdbinit: .gdbinit.tmpl
        sed "s/localhost:1234/localhost:$(GDBPORT)/" < $^ > $@
```
注意到，第二条语句中，使用的是 localhost 域名，但是我们的 QEMU 运行在宿主机上，所以要进行修改。
首先是将 gdbinit.tmpl 中的这两行
```
echo + target remote localhost:1234\n
target remote localhost:1234
```
改成
```
echo + target remote host.docker.internal:1234\n
target remote host.docker.internal:1234
```
然后把前面第二条语句改成
```makefile
.gdbinit: .gdbinit.tmpl
        sed "s/host.docker.internal:1234/host.docker.internal:$(GDBPORT)/" < $^ > $@
```
makefile 中还有个 target，规定了调试的构建过程
```makefile
qemu-gdb: fs.img xv6.img .gdbinit
        @echo "*** Now run 'gdb'." 1>&2
        $(QEMU) -serial mon:stdio $(QEMUOPTS) -S $(QEMUGDB)
```
这个 target 同样含有构建对象，所以同样需要删除第一行的三个构建目标对象。然后依次执行
```bash
# docker 容器
make .gdbinit
# 宿主机
qemu-gdb
# docker 容器
gdb -n -x .gdbinit
```
现在，就能使用 gdb 进行调试啦。