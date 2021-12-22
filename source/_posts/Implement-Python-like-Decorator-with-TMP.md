---
title: C++使用模板元编程实现RPC函数生成器
date: 2021-12-21 13:33:13
categories:
- Programming
- C/C++
tags:
- TMP
- Decorator
- C/C++
---

## 背景
最近在用C++实现一个RPC框架。RPC全称远程过程调用，也就是说在客户端调用远端服务器的过程，但是客户端并觉察不到，一切都表现得像是本地调用。实现这一特性，需要用到 AOP（面向切面编程），生成一个包装过的函数。Python 的函数装饰器本质上就是一个函数的工厂函数，来生产函数对象。所以准备用 C++ 来模拟 Python 的函数装饰器。

## Python装饰器
我对Python装饰器本质的理解，就是一个可调用对象。该可调用对象接受需要装饰的函数作为参数，然后返回一个闭包。这个返回的闭包，为原函数装饰了一些额外的功能，所以叫装饰器。我们来看一个简单的例子。
```python
def decorator(func):
    def warpper(*args):
        print("before calling")
        ret = func(*args)
        print("after calling")
        return ret
    return warpper

def foo(a, b):
    return a+b

foo = decorator(foo)
```
这段示例代码中的 `decorator` 就是我们的装饰器，`foo` 就是被装饰的原函数。`decorator` 返回的闭包 `warpper` 包装了两个打印的额外操作，同时执行被装饰函数。这里要提一下，在Python中，一切都是对象。比如Python的函数，在Python解释器解释完函数定义的代码后，解释器就会在运行时环境中生成一个函数对象，所以在Python中，函数能很自然作为得参数传入。最后一行代码执行之后，`foo` 这个变量就和装饰器返回的闭包绑定了，所以调用`foo`就相当于调用 `warpper`，从而实现了面向切面编程。

不过，这种写法看上去不那么优雅。于是，Python 提供了一个语法糖 `@decorator`，让函数在定义的同时被装饰，使代码更加直观。

## TMP
C++ 在 C++11 的时候，加入了模板来支持泛型，C++ 的模板在编译过程中将模板代码特化成相应类型的静态代码，从而给 C++ 加入了元编程的特性。使用模板元编程，能够让静态的C++实现一些动态语言的特性，当然实现看上去很丑陋。
### SFINAE
`SFINAE` 全称 `Substitution Failure Is Not An Error`，中文翻译成`替换失败并非错误`。是指当创建重载函数的集合时，有些函数是模板函数。所以在实例化这些模板函数的时候，需要用模板实参来替换模板形参。如果某个实参替换失败，编译器并不会报错，而是继续在集合中寻找合适的重载函数进行实例化。如果在集合中有至少一个重载函数的实参替换成功，就认为函数解析是成功的。Talk is Cheap, Show you my code. 下面来看一下[ cppreference ](https://en.cppreference.com/w/cpp/language/sfinae)中的一个简单案例。
```c++
template <typename T>
auto f(typename T::B*);

template <typename T>
auto f(T);

f<int>(0);
```
在这里，最后一行代码，回使用第二个重载。因为对于第一个重载，要求 `T` 中有嵌套类型 `B*`，而 `int` 没有嵌套类型，出现替换错误，但是编译器并不会因此报错然后停止编译，而是将该函数从集合中移除，然后继续解析剩下的函数。在这里第二个函数替换成功，重载函数候选集合中还剩一个函数，所以编译器认为解析是成功的，也认为在运行时函数调用是良好的。

`SFINA` 最初引入是为了防止产生不良程序。比如引入的头文件中有一个和自己实现的函数不相关但是同名的函数模板，这个时候，编译器不应该报错，也不应该实例化该不相关的函数从而导致运行时错误。但是，后来人们发现，这个特性可以实现编译期的 `introspection`，也就是说在编译期判断模板参数是否有特定的性质，比如是否声明了某个类型别名。这个功能，可以用于模板形参包的解包，我们下一节会详细讲述这个用法。
### Parameter pack
因为装饰器需要装饰的函数的形参个数和类型都是不确定的，但是C++是静态语言，需要在编译的时候就确定数据类型。不能像Python那样使用 `*args` 进行运行时的动态绑定。这时，就要使用 `C++11` 引入的特性：模板形参包。

模板形参包允许模板接受零个或多个实参，至少含有一个模板实参的形参包叫做变长模板。模板形参包语法如下：
```c++
template <typename... Args>
struct A {};

A<int, float> a{};
```
因为我们的 `RPC` 需要处理每一个形参，将他们序列化成数据流交给TCP发送给服务器，所以我们装饰器的 `wrapper` 要对形参包进行解包操做。当然，如果只是调用原函数，可以直接把形参包传给原函数，让编译器的类型计算帮我们解包。下面来分析一下解包的代码。
```c++
template <typename... Args> struct type_list;

template <typename T> struct type_list<T> { using head = T; };

template <typename Head, typename... Tail>
struct type_list<Head, Tail...> : type_list<Head> {
    using tail = type_list<Tail...>;
};

using args = type_list<Args...>;
```
这段代码参考了 `Lisp` 的列表，递归定义了参数列表。注意最后一行代码，如果形参包至少有两个实参，那么就会匹配第三个定义，这时形参包的头就被解析出来了，同时声明类型别名 `tail` 表示剩下的形参包，直到形参包还剩最后一个形参时，就会匹配第二个定义，递归结束。

下面这些代码是一些辅助函数，用来计算参数列表大小。`std::integral_constant` 包装了一个编译期常量。`count` 继承他，就能获取参数列表的大小。`std::conditional_t<condition, if_true, if_false>` 有点类似C++的三目运算符，如果 `condition` 为真，则返回 `if_true` 对应的模板实参，否则返回 `if_false` 对应的模板实参。提一下，`std::conditional_t` 是 `C++14` 的特性，`std::conditional` 是 `C++11` 的特性。
```c++
// calculate size of type list
template <typename... Args> struct count;

template <typename... Args>
struct count<type_list<Args...>>
    : std::integral_constant<std::size_t, sizeof...(Args)> {};

// check wheather has tail
template <typename ArgTypeList>
struct has_tail : std::conditional_t<(count<ArgTypeList>::value > 1),
                                     std::true_type, std::false_type> {};

// check wheather empty list
template <typename ArgTypeList>
struct empty_list : std::conditional_t<(count<ArgTypeList>::value == 0),
                                       std::true_type, std::false_type> {};

```

## 代码
准备知识都已经梳理完了，可以实现我们的装饰器了。
```c++
template <typename Reply, typename... Args>
auto decorator() {
    auto wrapper = [](Args&&... args) {
        Handler<Args...>::handle(args...);
        Reply reply = 0;
        return reply;
    };
    return wrapper;
}
using add_t = std::function<int(int, int)>;

add_t add = decorator<int, int, int>();
```
由于RPC客户端调用的函数本身不需要执行任何操作，所以不需要像 Python 的装饰器那样接受一个函数作为对象，但是基本思想和设计哲学类似。

`Handle` 是函数需要真正执行的代码，包括网络操作和序列化。这里只贴与元编程相关的代码。
```c++
template <typename... Args>
class Handler {
    template <typename ArgTypeList, bool HasTail, bool Empty, typename... ArgList>
    struct handle_impl;

    // Case 1: has tail
    template <typename ArgTypeList, typename Head, typename... Tail>
    struct handle_impl<ArgTypeList, true, false, Head, Tail...> {
        static void call(Head &head, Tail &... tail) {
            actual_for_args(head);

            using ArgTypeListTail = typename ArgTypeList::tail;

            constexpr bool has_tail_v = has_tail<ArgTypeListTail>::value;
            constexpr bool empty_list_v = empty_list<ArgTypeListTail>::value;

            handle_impl<ArgTypeListTail, has_tail_v, empty_list_v, Tail...>::call(tail...);
        }
    };

    // Case 2: no tail, not empty
    template <typename ArgTypeList, typename Head>
    struct handle_impl<ArgTypeList, false, false, Head> {
        static void call(Head &head) { actual_for_args(head); }
    };

    // Case 3: empty
    template <typename ArgTypeList> struct handle_impl<ArgTypeList, false, true> {
        static void call() { actual_for_void(); }
    };

public:
    static auto handle(Args &... args) {
        args_json = std::make_unique<std::string>();
        using ArgTypeList = type_list<Args...>;

        constexpr bool has_tail_v = has_tail<ArgTypeList>::value;
        constexpr bool empty_list_v = empty_list<ArgTypeList>::value;

        handle_impl<ArgTypeList, has_tail_v, empty_list_v, Args...>::call(args...);

        return std::move(args_json);
    }
};
```
`handle_impl` 重载函数集合总共有三个函数，分别对应 `type_list` 长度大于1，长度等于1和长度等于0，编译器会根据传入的模板实参来匹配相对应的重载函数。同时，也利用递归调用来对形参包解包。

最后，打个广告，如前文所说，最近正在施工一个 `RPC` 框架，这里是[ repo ](https://github.com/machearn/rpc)地址，欢迎star，欢迎提issue。